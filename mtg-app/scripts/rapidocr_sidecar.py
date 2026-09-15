"""
Sidecar RapidOCR pour le scan MTG (local, ONNX).
Usage: python scripts/rapidocr_sidecar.py [--port=5201]
POST /ocr  (raw image bytes or multipart file) -> JSON {texts, scores, joined}
GET  /health
"""
from __future__ import annotations

import argparse
import io
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
import threading

from rapidocr import EngineType, LangDet, LangRec, ModelType, OCRVersion, RapidOCR
from PIL import Image
import numpy as np

ENGINE: RapidOCR | None = None
OCR_LOCK = threading.Lock()


def build_engine() -> RapidOCR:
    # LATIN = FR/EN accents (ç, é…) — mieux pour noms de cartes FR
    return RapidOCR(
        params={
            "Det.engine_type": EngineType.ONNXRUNTIME,
            "Det.lang_type": LangDet.EN,
            "Rec.engine_type": EngineType.ONNXRUNTIME,
            "Rec.lang_type": LangRec.LATIN,
            "Rec.ocr_version": OCRVersion.PPOCRV5,
            "Rec.model_type": ModelType.MOBILE,
            "Global.text_score": 0.4,
        }
    )


def _box_top(box: Any) -> float | None:
    """Y min d'une bbox RapidOCR (points [[x,y],...] ou [x0,y0,x1,y1])."""
    try:
        if box is None:
            return None
        # numpy array Nx2
        if hasattr(box, "shape") and getattr(box, "ndim", 0) == 2:
            return float(box[:, 1].min())
        if isinstance(box, (list, tuple)) and box and isinstance(box[0], (list, tuple)):
            return float(min(float(p[1]) for p in box))
        if isinstance(box, (list, tuple)) and len(box) >= 4 and not isinstance(box[0], (list, tuple)):
            return float(min(float(box[1]), float(box[3])))
        # list of points as numpy rows
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


def run_ocr(img_bytes: bytes) -> dict[str, Any]:
    assert ENGINE is not None

    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    # Petites crops webcam : upscale pour la détection PP-OCR
    min_h = 480
    if img.height < min_h:
        scale = max(2, int(np.ceil(min_h / img.height)))
        img = img.resize((img.width * scale, img.height * scale), Image.Resampling.LANCZOS)
    h = img.height
    arr = np.array(img)
    with OCR_LOCK:
        result = ENGINE(arr)
    texts = list(getattr(result, "txts", None) or ())
    scores_raw = getattr(result, "scores", None)
    scores = [float(s) for s in (scores_raw if scores_raw is not None else ())]
    boxes_raw = getattr(result, "boxes", None)
    boxes = list(boxes_raw) if boxes_raw is not None else []
    # Fallback si API différente selon version
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
    tops = [_box_top(b) for b in boxes]

    def is_type_line(t: str) -> bool:
        low = t.lower().strip()
        if low.startswith(
            (
                "créature",
                "creature",
                "artefact",
                "enchantement",
                "éphémère",
                "ephemere",
                "instant",
                "rituel",
                "planeswalker",
                "terrain",
                "legendary",
                "legendaire",
            )
        ):
            return True
        # "humain et gredin", "insecte et guerrier"
        if " et " in low and len(low.split()) <= 5 and not low.startswith(("ombre", "essaim", "façonneur", "negoci", "négoci")):
            # heuristique type-line FR sans "Créature :"
            if any(
                w in low
                for w in (
                    "humain",
                    "gredin",
                    "zombie",
                    "guerrier",
                    "insecte",
                    "shamane",
                    "ombre",
                    "soldat",
                    "sorcier",
                )
            ):
                # "Ombre de la nuit" contains ombre but also "de la" — keep if has de/des/d'
                if any(x in low for x in (" de ", " des ", " d'", " d’")):
                    return False
                return True
        return False

    # Bandeau titre : y <= 22% hauteur
    name_texts: list[str] = []
    ranked: list[tuple[float, str]] = []
    for t, top in zip(texts, tops):
        if not t or not str(t).strip() or top is None:
            continue
        s = str(t).strip()
        if is_type_line(s):
            continue
        ranked.append((top, s))
        if top <= h * 0.22:
            name_texts.append(s)
    if not name_texts and ranked:
        ranked.sort(key=lambda x: x[0])
        top0, s0 = ranked[0]
        if top0 <= h * 0.40:
            name_texts = [s0]

    joined = " ".join(t.strip() for t in texts if t and t.strip())
    name_joined = " ".join(name_texts)
    return {
        "texts": [str(t) for t in texts],
        "scores": scores,
        "tops": tops,
        "name_texts": name_texts,
        "name_joined": name_joined,
        "joined": joined,
        "height": h,
        "engine": "rapidocr-latin-v5",
    }


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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path.startswith("/health"):
            self._json(200, {"ok": True, "engine": "rapidocr"})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if not self.path.startswith("/ocr"):
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b""
        ctype = (self.headers.get("Content-Type") or "").lower()
        if "multipart/form-data" in ctype:
            # Simple multipart: take first binary part after headers
            # Prefer raw body for our Node client
            idx = raw.find(b"\r\n\r\n")
            if idx >= 0:
                raw = raw[idx + 4 :]
                end = raw.rfind(b"\r\n--")
                if end > 0:
                    raw = raw[:end]
        if not raw:
            self._json(400, {"error": "empty body"})
            return
        try:
            self._json(200, run_ocr(raw))
        except Exception as e:
            self._json(500, {"error": str(e)})


def main() -> None:
    global ENGINE
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5201)
    parser.add_argument("--host", type=str, default="127.0.0.1")
    args = parser.parse_args()
    print("Loading RapidOCR (latin PP-OCRv5)…", flush=True)
    ENGINE = build_engine()
    # warm-up
    try:
        ENGINE(np.zeros((64, 256, 3), dtype=np.uint8))
    except Exception:
        pass
    print(f"RapidOCR sidecar ready on http://{args.host}:{args.port}", flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
