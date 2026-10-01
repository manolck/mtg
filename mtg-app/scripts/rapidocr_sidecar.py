"""
Sidecar RapidOCR + OpenCV pour le scan MTG (local, ONNX).

Usage: python scripts/rapidocr_sidecar.py [--port=5201]

GET  /health
POST /ocr   — OCR seul (raw image bytes)
POST /scan  — locate + warp + 2 ROI OCR + set|cn lookup + fuzzy FR/EN

Indexes attendus (générés par npm run build-scan-indexes) :
  public/scan-indexes/prints.json
  public/scan-indexes/names.json
"""
from __future__ import annotations

import argparse
import io
import json
import math
import os
import re
import sys
import threading
import time
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from rapidocr import EngineType, LangDet, LangRec, ModelType, OCRVersion, RapidOCR

try:
    import cv2
except ImportError as e:  # pragma: no cover
    print("opencv-python-headless is required: pip install -r requirements-ocr.txt", file=sys.stderr)
    raise e

ENGINE: RapidOCR | None = None
OCR_LOCK = threading.Lock()

# Indexes loaded at startup
PRINTS: dict[str, list[dict[str, Any]]] = {}
NAMES: dict[str, list[dict[str, Any]]] = {}
NAME_POOL: list[dict[str, Any]] = []
BY_TOKEN: dict[str, list[dict[str, Any]]] = {}
BY_PREFIX: dict[str, list[dict[str, Any]]] = {}

ROOT = Path(__file__).resolve().parent.parent
INDEX_DIR = ROOT / "public" / "scan-indexes"

CARD_ASPECT = 63.0 / 88.0  # width/height MTG
WARP_W, WARP_H = 446, 622


def build_engine() -> RapidOCR:
    return RapidOCR(
        params={
            "Det.engine_type": EngineType.ONNXRUNTIME,
            "Det.lang_type": LangDet.EN,
            "Rec.engine_type": EngineType.ONNXRUNTIME,
            "Rec.lang_type": LangRec.LATIN,
            "Rec.ocr_version": OCRVersion.PPOCRV5,
            "Rec.model_type": ModelType.MOBILE,
            "Global.text_score": 0.3,
        }
    )


# ── Normalization / fuzzy (ported essentials from ocr-match-lib.mjs) ─────────


def normalize_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def clean_ocr_key(s: str | None) -> str:
    if not s:
        return ""
    s = re.sub(r"[|\[\](){}«»<>]", " ", s)
    s = re.sub(r"[^\w\s'\-]", " ", s, flags=re.UNICODE)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def normalize_name_key(s: str) -> str:
    return re.sub(r"\s+", " ", normalize_accents(clean_ocr_key(s).lower())).strip()


def tokenize(s: str) -> list[str]:
    return [
        t
        for t in re.split(r"[\s'\-]+", normalize_accents(s.lower()))
        if len(t.strip()) >= 2
    ]


def jaro_winkler(s1: str, s2: str) -> float:
    if s1 == s2:
        return 1.0
    if not s1 or not s2:
        return 0.0
    len1, len2 = len(s1), len(s2)
    match_window = max(0, max(len1, len2) // 2 - 1)
    s1_match = [False] * len1
    s2_match = [False] * len2
    matches = 0
    for i in range(len1):
        start = max(0, i - match_window)
        end = min(i + match_window + 1, len2)
        for j in range(start, end):
            if s2_match[j] or s1[i] != s2[j]:
                continue
            s1_match[i] = True
            s2_match[j] = True
            matches += 1
            break
    if not matches:
        return 0.0
    k = 0
    transpositions = 0
    for i in range(len1):
        if not s1_match[i]:
            continue
        while not s2_match[k]:
            k += 1
        if s1[i] != s2[k]:
            transpositions += 1
        k += 1
    jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
    prefix = 0
    for i in range(min(4, len1, len2)):
        if s1[i] == s2[i]:
            prefix += 1
        else:
            break
    return min(1.0, jaro + prefix * 0.1 * (1 - jaro))


def tokens_fuzzy_equal(a: str, b: str) -> bool:
    if a == b:
        return True
    if len(a) >= 4 and len(b) >= 4:
        shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
        if longer.find(shorter) >= 0 and len(shorter) / len(longer) >= 0.85 and shorter[0] == longer[0]:
            return True
    len_ratio = min(len(a), len(b)) / max(len(a), len(b))
    if len_ratio < 0.65:
        return False
    thr = 0.88 if abs(len(a) - len(b)) >= 2 else 0.82
    jw = jaro_winkler(a, b)
    if jw >= thr and a[0] == b[0]:
        return True
    if len(a) >= 6 and len(b) >= 6 and len_ratio >= 0.75 and a[-4:] == b[-4:] and jw >= 0.82:
        return True
    return False


TYPE_LINE_WORD = re.compile(
    r"^(creature|creatures|créature|creature|enchantment|enchantement|instant|"
    r"instantané|instantane|sorcery|rituel|artifact|artefact|land|terrain|"
    r"planeswalker|legendary|legendaire)$",
    re.I,
)


def looks_like_type_line(ocr: str) -> bool:
    sig = [t for t in tokenize(ocr) if len(t) >= 3]
    if not sig:
        return True
    if any(TYPE_LINE_WORD.match(t) for t in sig) and len(sig) <= 3:
        return True
    return False


def score_name_match(ocr_text: str, card_name: str, lang: str | None) -> float:
    ocr = clean_ocr_key(ocr_text)
    if not ocr or not card_name:
        return 0.0
    o_norm = normalize_accents(ocr.lower())
    n_norm = normalize_accents(card_name.lower())
    if o_norm == n_norm:
        return 1.0
    jw = max(jaro_winkler(o_norm, n_norm), jaro_winkler(ocr.lower(), card_name.lower()))
    o_tokens = tokenize(ocr)
    n_tokens = tokenize(card_name)
    sig_o = [t for t in o_tokens if len(t) >= 3]
    sig_n = [t for t in n_tokens if len(t) >= 3]
    name_hits = 0
    used_o: set[int] = set()
    for nt in sig_n:
        best_i, best_jw = -1, -1.0
        for i, ot in enumerate(sig_o):
            if i in used_o or not tokens_fuzzy_equal(ot, nt):
                continue
            tj = jaro_winkler(ot, nt)
            if tj > best_jw:
                best_jw, best_i = tj, i
        if best_i >= 0:
            used_o.add(best_i)
            name_hits += 1
    name_coverage = name_hits / len(sig_n) if sig_n else 0.0
    ocr_hits = 0
    used_n: set[int] = set()
    for ot in sig_o:
        best_i, best_jw = -1, -1.0
        for i, nt in enumerate(sig_n):
            if i in used_n or not tokens_fuzzy_equal(ot, nt):
                continue
            tj = jaro_winkler(ot, nt)
            if tj > best_jw:
                best_jw, best_i = tj, i
        if best_i >= 0:
            used_n.add(best_i)
            ocr_hits += 1
    ocr_precision = ocr_hits / len(sig_o) if sig_o else 0.0
    len_ratio = min(len(o_norm), len(n_norm)) / max(len(o_norm), len(n_norm), 1)
    score = 0.28 * jw + 0.42 * name_coverage + 0.2 * ocr_precision + 0.1 * len_ratio
    if lang == "fr":
        score += 0.08
    elif lang and lang not in ("en", "fr"):
        score -= 0.05
    # Unmatched long OCR tokens
    unmatched = sum(
        1 for ot in sig_o if len(ot) >= 5 and not any(tokens_fuzzy_equal(ot, nt) for nt in sig_n)
    )
    if unmatched:
        score -= 0.32 * unmatched
    if len(sig_o) >= 2 and ocr_precision < 0.75:
        score -= 0.35 * (0.75 - ocr_precision)
    last_n = sig_n[-1] if sig_n else None
    last_o = sig_o[-1] if sig_o else None
    if last_n and len(last_n) >= 4:
        last_hit = bool(last_o and len(last_o) >= 4 and tokens_fuzzy_equal(last_o, last_n))
        if not last_hit and last_o and last_o[0] == last_n[0] and jaro_winkler(last_o, last_n) >= 0.7:
            last_hit = True
        score += 0.14 if last_hit else -0.22
    return max(0.0, min(1.0, score))


def detect_ocr_lang_hint(ocr: str) -> str | None:
    if re.search(r"[àâäéèêëïîôùûüçœæ]", ocr, re.I):
        return "fr"
    if re.search(r"\b(des|du|les|une|aux|dans|pour)\b", ocr, re.I):
        return "fr"
    if re.search(r"\b(the|of|and|from|into|with)\b", ocr, re.I):
        return "en"
    return None


def expand_ocr_candidates(raw: str) -> list[str]:
    key = clean_ocr_key(raw)
    if not key:
        return []
    out: set[str] = {key}
    tokens = key.split()
    if len(tokens) >= 2:
        out.add(" ".join(tokens[:3]))
        out.add(" ".join(tokens[-3:]))
    return [c for c in out if not looks_like_type_line(c)]


def fuzzy_match_names(ocr_candidates: list[str], top_k: int = 3) -> list[dict[str, Any]]:
    cleaned: list[str] = []
    for c in ocr_candidates:
        cleaned.extend(expand_ocr_candidates(c))
    cleaned = list(dict.fromkeys(c for c in cleaned if c and len(c) >= 3))
    if not cleaned or not NAME_POOL:
        return []

    # Exact / normalized hits first
    hits: list[tuple[float, dict[str, Any], str]] = []
    for cand in cleaned:
        lang_hint = detect_ocr_lang_hint(cand)
        key = normalize_name_key(cand)
        exact = NAMES.get(key) or NAMES.get(cand.lower())
        if exact:
            for e in exact[:4]:
                sc = 0.98 + (0.02 if e.get("lang") == lang_hint else 0)
                hits.append((sc, e, "fuzzy_exact"))
            continue
        # Narrow by tokens
        tokens = [t for t in tokenize(cand) if len(t) >= 3]
        scored_entries: dict[int, tuple[float, dict[str, Any]]] = {}
        for t in tokens:
            for e in BY_TOKEN.get(t, [])[:80]:
                eid = id(e)
                scored_entries[eid] = (scored_entries.get(eid, (0, e))[0] + 3, e)
            pref = BY_PREFIX.get(t[:3], [])
            for e in pref[:40]:
                eid = id(e)
                scored_entries[eid] = (scored_entries.get(eid, (0, e))[0] + 1, e)
        candidates = [e for _, e in sorted(scored_entries.values(), key=lambda x: -x[0])[:200]]
        if not candidates:
            candidates = NAME_POOL[:300]
        for e in candidates:
            label = e.get("printed_name") or e.get("name") or ""
            sc = score_name_match(cand, label, e.get("lang"))
            if sc >= 0.55:
                hits.append((sc, e, "fuzzy"))

    hits.sort(key=lambda x: -x[0])
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for sc, e, method in hits:
        oid = e.get("oracle_id") or ""
        sid = e.get("scryfall_id") or oid
        if sid in seen or oid in seen:
            continue
        seen.add(sid)
        if oid:
            seen.add(oid)
        out.append(
            {
                "oracle_id": e.get("oracle_id"),
                "lang": e.get("lang"),
                "name": e.get("name"),
                "printed_name": e.get("printed_name") or e.get("name"),
                "scryfall_id": e.get("scryfall_id"),
                "set": e.get("set"),
                "collector_number": e.get("cn"),
                "score": round(sc, 4),
                "method": method,
            }
        )
        if len(out) >= top_k:
            break
    return out


# ── Index loading ────────────────────────────────────────────────────────────


def load_indexes() -> None:
    global PRINTS, NAMES, NAME_POOL, BY_TOKEN, BY_PREFIX
    prints_path = INDEX_DIR / "prints.json"
    names_path = INDEX_DIR / "names.json"
    if prints_path.exists():
        with open(prints_path, encoding="utf-8") as f:
            PRINTS = json.load(f)
        print(f"Loaded prints index: {len(PRINTS)} keys", flush=True)
    else:
        print(f"WARNING: missing {prints_path} — run npm run build-scan-indexes", flush=True)
        PRINTS = {}
    if names_path.exists():
        with open(names_path, encoding="utf-8") as f:
            NAMES = json.load(f)
        print(f"Loaded names index: {len(NAMES)} keys", flush=True)
    else:
        print(f"WARNING: missing {names_path} — run npm run build-scan-indexes", flush=True)
        NAMES = {}

    pool: list[dict[str, Any]] = []
    seen: set[str] = set()
    by_token: dict[str, list[dict[str, Any]]] = {}
    by_prefix: dict[str, list[dict[str, Any]]] = {}
    for entries in NAMES.values():
        for e in entries:
            if e.get("lang") not in ("en", "fr"):
                continue
            key = f"{e.get('oracle_id')}|{e.get('lang')}|{e.get('name')}"
            if key in seen:
                continue
            seen.add(key)
            pool.append(e)
            label = e.get("printed_name") or e.get("name") or ""
            for t in tokenize(label):
                if len(t) >= 4:
                    by_token.setdefault(t, []).append(e)
                if len(t) >= 3:
                    by_prefix.setdefault(t[:3], []).append(e)
    # Cap lists
    for k, v in by_token.items():
        if len(v) > 60:
            by_token[k] = v[:60]
    for k, v in by_prefix.items():
        if len(v) > 80:
            by_prefix[k] = v[:80]
    NAME_POOL = pool
    BY_TOKEN = by_token
    BY_PREFIX = by_prefix
    print(f"Fuzzy pool: {len(NAME_POOL)} entries", flush=True)


# ── Card location + warp ─────────────────────────────────────────────────────


def order_quad(pts: np.ndarray) -> np.ndarray:
    """Order 4 points TL, TR, BR, BL."""
    pts = pts.astype(np.float32).reshape(4, 2)
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).ravel()
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def find_card_quad(bgr: np.ndarray) -> np.ndarray | None:
    """Canny + adaptive blob → largest card-like contour quad."""
    h, w = bgr.shape[:2]
    area_img = float(w * h)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    candidates: list[tuple[float, np.ndarray]] = []

    def consider(cnt: np.ndarray) -> None:
        area = cv2.contourArea(cnt)
        if area < area_img * 0.04 or area > area_img * 0.95:
            return
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.025 * peri, True)
        if len(approx) != 4:
            rect = cv2.minAreaRect(cnt)
            box = cv2.boxPoints(rect)
            approx = box.reshape(-1, 1, 2)
        quad = approx.reshape(4, 2).astype(np.float32)
        xs, ys = quad[:, 0], quad[:, 1]
        bw, bh = float(max(xs) - min(xs)), float(max(ys) - min(ys))
        if bw < 60 or bh < 80:
            return
        aspect = bw / max(bh, 1)
        # MTG ~0.716; allow perspective (browser uses ±0.28)
        if not (0.44 <= aspect <= 1.05 or 0.95 <= aspect <= 2.2):
            return
        # Side length balance
        ordered = order_quad(quad)
        sides = [
            float(np.linalg.norm(ordered[i] - ordered[(i + 1) % 4])) for i in range(4)
        ]
        if min(sides) <= 0 or max(sides) / min(sides) > 3.2:
            return
        portrait = bw / bh if aspect <= 1 else bh / bw
        score = (area / area_img) * (1.0 - min(0.35, abs(portrait - CARD_ASPECT)))
        candidates.append((score, ordered))

    # Pass A: Canny (normal + inverted) — mirrors browser detectCardEdges
    for src in (blur, 255 - blur):
        edges = cv2.Canny(src, 50, 150)
        edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            consider(cnt)

    # Pass B: adaptive threshold (white/black borders)
    for block, C in ((31, 8), (51, 10), (21, 5)):
        thr = cv2.adaptiveThreshold(
            blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block, C
        )
        thr = cv2.morphologyEx(thr, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
        contours, _ = cv2.findContours(thr, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            consider(cnt)

    if not candidates:
        return None
    candidates.sort(key=lambda x: -x[0])
    return candidates[0][1]


def warp_card(bgr: np.ndarray, quad: np.ndarray | None) -> np.ndarray:
    h, w = bgr.shape[:2]
    if quad is None:
        # Center-crop to MTG portrait aspect instead of stretching a landscape webcam frame
        target_aspect = CARD_ASPECT  # w/h
        frame_aspect = w / max(h, 1)
        if frame_aspect > target_aspect:
            new_w = int(h * target_aspect)
            x0 = max(0, (w - new_w) // 2)
            crop = bgr[:, x0 : x0 + new_w]
        else:
            new_h = int(w / target_aspect)
            y0 = max(0, (h - new_h) // 2)
            crop = bgr[y0 : y0 + new_h, :]
        return cv2.resize(crop, (WARP_W, WARP_H), interpolation=cv2.INTER_AREA)
    dst = np.array(
        [[0, 0], [WARP_W - 1, 0], [WARP_W - 1, WARP_H - 1], [0, WARP_H - 1]],
        dtype=np.float32,
    )
    M = cv2.getPerspectiveTransform(quad.astype(np.float32), dst)
    return cv2.warpPerspective(bgr, M, (WARP_W, WARP_H), flags=cv2.INTER_LINEAR)


# ── OCR helpers ──────────────────────────────────────────────────────────────


def _box_top(box: Any) -> float | None:
    try:
        if box is None:
            return None
        if hasattr(box, "shape") and getattr(box, "ndim", 0) == 2:
            return float(box[:, 1].min())
        if isinstance(box, (list, tuple)) and box and isinstance(box[0], (list, tuple)):
            return float(min(float(p[1]) for p in box))
        if isinstance(box, (list, tuple)) and len(box) >= 4 and not isinstance(box[0], (list, tuple)):
            return float(min(float(box[1]), float(box[3])))
        if isinstance(box, (list, tuple)) and len(box) >= 2:
            ys = []
            for p in box:
                if hasattr(p, "__getitem__"):
                    ys.append(float(p[1]))
            if ys:
                return min(ys)
    except (TypeError, ValueError, IndexError):
        return None
    return None


def prep_for_ocr(arr_rgb: np.ndarray, min_h: int = 200) -> np.ndarray:
    """Upscale + mild contrast so PP-OCR can detect thin title/collector text."""
    h, w = arr_rgb.shape[:2]
    if h < min_h:
        scale = max(2.0, min_h / max(h, 1))
        arr_rgb = cv2.resize(arr_rgb, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    # CLAHE on L channel
    lab = cv2.cvtColor(arr_rgb, cv2.COLOR_RGB2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l2 = clahe.apply(l)
    lab2 = cv2.merge([l2, a, b])
    return cv2.cvtColor(lab2, cv2.COLOR_LAB2RGB)


def run_ocr_array(arr_rgb: np.ndarray) -> dict[str, Any]:
    assert ENGINE is not None
    arr_rgb = prep_for_ocr(arr_rgb, min_h=200)
    h = arr_rgb.shape[0]
    with OCR_LOCK:
        result = ENGINE(arr_rgb)
    texts = list(getattr(result, "txts", None) or ())
    scores_raw = getattr(result, "scores", None)
    scores = [float(s) for s in (scores_raw if scores_raw is not None else ())]
    boxes_raw = getattr(result, "boxes", None)
    boxes = list(boxes_raw) if boxes_raw is not None else []
    if not texts and result is not None:
        raw = getattr(result, "result", None) or result
        if isinstance(raw, list):
            for item in raw:
                if isinstance(item, (list, tuple)) and len(item) >= 2:
                    boxes.append(item[0])
                    texts.append(str(item[1]))
                    if len(item) >= 3:
                        try:
                            scores.append(float(item[2]))
                        except (TypeError, ValueError):
                            scores.append(0.0)
    # Second pass: inverted if empty (dark title bars / foil glare)
    if not texts:
        inv = 255 - arr_rgb
        with OCR_LOCK:
            result2 = ENGINE(inv)
        texts = list(getattr(result2, "txts", None) or ())
        scores_raw = getattr(result2, "scores", None)
        scores = [float(s) for s in (scores_raw if scores_raw is not None else ())]
        boxes_raw = getattr(result2, "boxes", None)
        boxes = list(boxes_raw) if boxes_raw is not None else []
    tops = [_box_top(b) for b in boxes]
    return {
        "texts": [str(t) for t in texts],
        "scores": scores,
        "tops": tops,
        "joined": " ".join(t.strip() for t in texts if t and str(t).strip()),
        "height": h,
    }


def run_ocr(img_bytes: bytes) -> dict[str, Any]:
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    min_h = 480
    if img.height < min_h:
        scale = max(2, int(np.ceil(min_h / img.height)))
        img = img.resize((img.width * scale, img.height * scale), Image.Resampling.LANCZOS)
    arr = np.array(img)
    out = run_ocr_array(arr)
    # Name band heuristic (legacy /ocr)
    h = out["height"]
    name_texts: list[str] = []
    for t, top in zip(out["texts"], out["tops"]):
        if t and top is not None and top <= h * 0.22:
            name_texts.append(str(t).strip())
    out["name_texts"] = name_texts
    out["name_joined"] = " ".join(name_texts)
    out["engine"] = "rapidocr-latin-v5"
    return out


# Scryfall set codes: m21, neo, 2x2, clb — alphanumeric, ≥1 letter
SET_RE = re.compile(r"\b(?=[A-Za-z0-9]*[A-Za-z])([A-Za-z0-9]{2,5})\b")
CN_RE = re.compile(r"\b(\d{1,4}[A-Za-z]?)\b")
SET_TOKEN = r"(?=[A-Za-z0-9]*[A-Za-z])([A-Za-z0-9]{2,5})"


def parse_set_and_cn(bottom_text: str) -> tuple[str | None, str | None]:
    """Extract set code + collector number from bottom-strip OCR."""
    if not bottom_text:
        return None, None
    # Common patterns: "123/264 M21" or "M21 123" or "123 ★ M21"
    text = bottom_text.replace("★", " ").replace("•", " ")
    text = re.sub(r"[^\w\s/\-]", " ", text)
    cn: str | None = None
    set_code: str | None = None
    m = re.search(
        rf"(?:^|\s)(\d{{1,4}}[A-Za-z]?)\s*/\s*\d{{1,4}}.*?{SET_TOKEN}\b",
        text,
        re.I,
    )
    if m:
        cn, set_code = m.group(1), m.group(2).lower()
        return set_code, cn
    m = re.search(rf"\b{SET_TOKEN}\s+(\d{{1,4}}[A-Za-z]?)\b", text, re.I)
    if m:
        return m.group(1).lower(), m.group(2)
    m = re.search(rf"\b(\d{{1,4}}[A-Za-z]?)\s+{SET_TOKEN}\b", text, re.I)
    if m:
        return m.group(2).lower(), m.group(1)
    cns = CN_RE.findall(text)
    sets = [s.lower() for s in SET_RE.findall(text) if not s.isdigit() and 2 <= len(s) <= 5]
    junk = {"the", "and", "for", "card", "magic", "wizards", "of", "tm", "r", "en", "fr"}
    sets = [s for s in sets if s not in junk]
    if cns:
        cn = cns[0]
    if sets:
        sets.sort(key=lambda s: (0 if len(s) == 3 else 1, len(s)))
        set_code = sets[0]
    return set_code, cn


def lookup_prints(set_code: str | None, cn: str | None) -> list[dict[str, Any]]:
    if not set_code or not cn:
        return []
    set_code = set_code.lower().strip()
    cn = cn.strip()
    keys = [f"{set_code}|{cn}", f"{set_code}|{cn.lstrip('0') or '0'}"]
    if cn.isdigit():
        keys.append(f"{set_code}|{int(cn)}")
    entries: list[dict[str, Any]] = []
    seen: set[str] = set()
    for k in keys:
        for e in PRINTS.get(str(k), []):
            sid = e.get("scryfall_id") or f"{e.get('oracle_id')}|{e.get('lang')}"
            if sid in seen:
                continue
            seen.add(sid)
            entries.append(
                {
                    "oracle_id": e.get("oracle_id"),
                    "lang": e.get("lang"),
                    "name": e.get("name"),
                    "printed_name": e.get("printed_name") or e.get("name"),
                    "scryfall_id": e.get("scryfall_id"),
                    "set": e.get("set") or set_code,
                    "collector_number": e.get("cn") or cn,
                    "score": 1.0,
                    "method": "set_cn",
                }
            )
    # Prefer FR then EN
    entries.sort(key=lambda e: (0 if e.get("lang") == "fr" else 1 if e.get("lang") == "en" else 2))
    return entries[:3]


def _ocr_warped_bands(warped: np.ndarray) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any] | None]:
    """OCR title/bottom bands; if empty, OCR full warped card."""
    wh = warped.shape[0]
    title_roi = warped[0 : max(1, int(wh * 0.20)), :]
    bottom_roi = warped[max(0, int(wh * 0.80)) : wh, :]
    title_ocr = run_ocr_array(cv2.cvtColor(title_roi, cv2.COLOR_BGR2RGB))
    bottom_ocr = run_ocr_array(cv2.cvtColor(bottom_roi, cv2.COLOR_BGR2RGB))
    title_joined = title_ocr.get("joined") or ""
    bottom_joined = bottom_ocr.get("joined") or ""
    full_ocr: dict[str, Any] | None = None
    if not title_joined and not bottom_joined:
        full_ocr = run_ocr_array(cv2.cvtColor(warped, cv2.COLOR_BGR2RGB))
        fh = float(full_ocr.get("height") or wh)
        name_parts: list[str] = []
        bottom_parts: list[str] = []
        for t, top in zip(full_ocr.get("texts") or [], full_ocr.get("tops") or []):
            if not t or top is None:
                continue
            s = str(t).strip()
            if not s:
                continue
            if top <= fh * 0.28:
                name_parts.append(s)
            if top >= fh * 0.72:
                bottom_parts.append(s)
        if name_parts:
            title_joined = " ".join(name_parts)
            title_ocr = {**title_ocr, "texts": name_parts, "joined": title_joined}
        if bottom_parts:
            bottom_joined = " ".join(bottom_parts)
            bottom_ocr = {**bottom_ocr, "texts": bottom_parts, "joined": bottom_joined}
        if not title_joined and full_ocr.get("joined"):
            title_joined = str(full_ocr["joined"])
            title_ocr = {
                **title_ocr,
                "texts": list(full_ocr.get("texts") or []),
                "joined": title_joined,
            }
    return title_ocr, bottom_ocr, full_ocr


def run_scan(img_bytes: bytes) -> dict[str, Any]:
    t0 = time.perf_counter()
    timings: dict[str, float] = {}
    debug_dir = ROOT / "scripts" / ".scan-debug"
    try:
        debug_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        debug_dir = None

    pil = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    rgb = np.array(pil)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    if debug_dir is not None:
        cv2.imwrite(str(debug_dir / "last_input.jpg"), bgr)

    t1 = time.perf_counter()
    quad = find_card_quad(bgr)
    warped = warp_card(bgr, quad)
    timings["locate_ms"] = round((time.perf_counter() - t1) * 1000, 1)

    t2 = time.perf_counter()
    title_ocr, bottom_ocr, full_ocr = _ocr_warped_bands(warped)
    strategy = "located" if quad is not None else "center_crop"

    # Bad locate often yields empty OCR — retry center-crop
    if quad is not None and not (title_ocr.get("joined") or bottom_ocr.get("joined") or (full_ocr or {}).get("joined")):
        warped2 = warp_card(bgr, None)
        title_ocr, bottom_ocr, full_ocr = _ocr_warped_bands(warped2)
        if title_ocr.get("joined") or bottom_ocr.get("joined") or (full_ocr or {}).get("joined"):
            warped = warped2
            strategy = "center_crop_retry"
            quad = None

    # Still empty → OCR full original frame (downscaled if huge)
    if not (title_ocr.get("joined") or bottom_ocr.get("joined") or (full_ocr or {}).get("joined")):
        fh, fw = bgr.shape[:2]
        scale = 1.0
        if max(fh, fw) > 1280:
            scale = 1280 / max(fh, fw)
        full_bgr = (
            cv2.resize(bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            if scale < 1
            else bgr
        )
        full_ocr = run_ocr_array(cv2.cvtColor(full_bgr, cv2.COLOR_BGR2RGB))
        if full_ocr.get("joined"):
            strategy = "full_frame"
            # Prefer top-ish lines as title for fuzzy
            h_full = float(full_ocr.get("height") or 1)
            tops = full_ocr.get("tops") or []
            texts = full_ocr.get("texts") or []
            ranked = sorted(
                [(t, top) for t, top in zip(texts, tops) if t and top is not None],
                key=lambda x: x[1],
            )
            name_parts = [t for t, top in ranked if top <= h_full * 0.4][:3]
            bottom_parts = [t for t, top in ranked if top >= h_full * 0.6][-3:]
            title_ocr = {
                "texts": name_parts or [str(full_ocr["joined"])],
                "joined": " ".join(name_parts) if name_parts else str(full_ocr["joined"]),
                "scores": [],
                "tops": [],
                "height": h_full,
            }
            bottom_ocr = {
                "texts": bottom_parts,
                "joined": " ".join(bottom_parts),
                "scores": [],
                "tops": [],
                "height": h_full,
            }

    timings["ocr_ms"] = round((time.perf_counter() - t2) * 1000, 1)
    if debug_dir is not None:
        cv2.imwrite(str(debug_dir / "last_warped.jpg"), warped)

    title_joined = title_ocr.get("joined") or ""
    bottom_joined = bottom_ocr.get("joined") or ""
    set_code, cn = parse_set_and_cn(bottom_joined)
    if (not set_code or not cn) and full_ocr and full_ocr.get("joined"):
        set_code2, cn2 = parse_set_and_cn(str(full_ocr["joined"]))
        set_code = set_code or set_code2
        cn = cn or cn2

    t3 = time.perf_counter()
    candidates = lookup_prints(set_code, cn)
    method = "set_cn" if candidates else None
    if not candidates:
        ocr_cands = [title_joined] + list(title_ocr.get("texts") or [])
        if full_ocr:
            ocr_cands.append(str(full_ocr.get("joined") or ""))
            ocr_cands.extend(list(full_ocr.get("texts") or []))
        candidates = fuzzy_match_names(ocr_cands, top_k=3)
        method = "fuzzy" if candidates else None
    timings["match_ms"] = round((time.perf_counter() - t3) * 1000, 1)
    timings["total_ms"] = round((time.perf_counter() - t0) * 1000, 1)

    sys.stderr.write(
        f"[scan] strategy={strategy} located={quad is not None} "
        f"title={title_joined!r} bottom={bottom_joined!r} "
        f"set={set_code} cn={cn} cands={len(candidates)} method={method} "
        f"input={bgr.shape[1]}x{bgr.shape[0]}\n"
    )
    sys.stderr.flush()

    ok, buf = cv2.imencode(".jpg", warped, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
    warped_b64 = None
    if ok:
        import base64

        warped_b64 = "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")

    return {
        "candidates": candidates[:3],
        "timings_ms": timings,
        "ocr": {
            "title": title_joined,
            "title_texts": title_ocr.get("texts"),
            "bottom": bottom_joined,
            "bottom_texts": bottom_ocr.get("texts"),
            "set": set_code,
            "collector_number": cn,
            "method": method,
            "strategy": strategy,
            "full_joined": (full_ocr or {}).get("joined") if full_ocr else None,
        },
        "warped_jpeg": warped_b64,
        "located": quad is not None,
    }


# ── HTTP ─────────────────────────────────────────────────────────────────────


def read_body_image(handler: BaseHTTPRequestHandler) -> bytes:
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length) if length else b""
    ctype = (handler.headers.get("Content-Type") or "").lower()
    if "multipart/form-data" in ctype:
        idx = raw.find(b"\r\n\r\n")
        if idx >= 0:
            raw = raw[idx + 4 :]
            end = raw.rfind(b"\r\n--")
            if end > 0:
                raw = raw[:end]
    return raw


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _json(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_HEAD(self) -> None:
        path = self.path.split("?", 1)[0]
        if path.startswith("/health") or path.startswith("/ocr") or path.startswith("/scan"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path.startswith("/health"):
            self._json(
                200,
                {
                    "ok": True,
                    "engine": "rapidocr",
                    "prints_keys": len(PRINTS),
                    "names_keys": len(NAMES),
                    "scan": True,
                },
            )
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path.startswith("/scan"):
            raw = read_body_image(self)
            if not raw:
                self._json(400, {"error": "empty body"})
                return
            try:
                self._json(200, run_scan(raw))
            except Exception as e:
                self._json(500, {"error": str(e)})
            return
        if path.startswith("/ocr"):
            raw = read_body_image(self)
            if not raw:
                self._json(400, {"error": "empty body"})
                return
            try:
                self._json(200, run_ocr(raw))
            except Exception as e:
                self._json(500, {"error": str(e)})
            return
        self._json(404, {"error": "not found"})


def main() -> None:
    global ENGINE
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5201)
    parser.add_argument("--host", type=str, default="127.0.0.1")
    args = parser.parse_args()
    print("Loading scan indexes…", flush=True)
    load_indexes()
    print("Loading RapidOCR (latin PP-OCRv5)…", flush=True)
    ENGINE = build_engine()
    try:
        ENGINE(np.zeros((64, 256, 3), dtype=np.uint8))
    except Exception:
        pass
    print(f"RapidOCR scan sidecar ready on http://{args.host}:{args.port}", flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
