import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCamera } from '../hooks/useCamera';
import { detectCardEdges, drawQuadOnContext, type Quadrilateral } from '../utils/cardEdgeDetection';
import { rectifyCardToCanvas } from '../utils/rectifyCard';
import { extractCardNameWithOCR, CARD_NAME_REGION } from '../utils/cardOcr';
import {
  resolveOcrToDictionaryBestOf,
  preloadDictionary,
} from '../services/scryfallDictionaryService';
import { adaptiveCropCard } from '../utils/adaptiveCardCrop';
import { checkRapidOcr, rapidOcrCardName } from '../utils/rapidOcrClient';
import { Button } from '../components/UI/Button';

type MethodId = 'contour' | 'blob';

interface MethodResult {
  id: MethodId;
  label: string;
  description: string;
  cropUrl: string | null;
  name: string | null;
  lang: string | null;
  score: number;
  ocrTop: string[];
  locateMs: number;
  ocrMs: number;
  matchMs: number;
  totalMs: number;
  error: string | null;
}

interface VoteStats {
  contour: number;
  blob: number;
  tie: number;
}

const VOTES_KEY = 'mtg-scan-compare-votes';

function loadVotes(): VoteStats {
  try {
    const raw = localStorage.getItem(VOTES_KEY);
    if (!raw) return { contour: 0, blob: 0, tie: 0 };
    return { contour: 0, blob: 0, tie: 0, ...JSON.parse(raw) };
  } catch {
    return { contour: 0, blob: 0, tie: 0 };
  }
}

function saveVotes(v: VoteStats) {
  localStorage.setItem(VOTES_KEY, JSON.stringify(v));
}

async function runContourMethod(frame: HTMLCanvasElement): Promise<MethodResult> {
  const label = 'A — Contour + OCR';
  const description = 'Détection de bords → redressement perspective → RapidOCR/Tesseract (pipeline /scan)';
  const tAll = performance.now();
  let locateMs = 0;
  let ocrMs = 0;
  let matchMs = 0;
  let cropUrl: string | null = null;
  try {
    const t0 = performance.now();
    const quad: Quadrilateral = await detectCardEdges(frame);
    const rectified = await rectifyCardToCanvas(frame, quad, 350, 490);
    locateMs = Math.round(performance.now() - t0);
    cropUrl = rectified.toDataURL('image/jpeg', 0.92);

    const t1 = performance.now();
    const ocr = await extractCardNameWithOCR(cropUrl, CARD_NAME_REGION);
    ocrMs = Math.round(performance.now() - t1);

    const t2 = performance.now();
    const match = await resolveOcrToDictionaryBestOf([
      ocr.textAuto,
      ocr.textInverted,
      ...(ocr.candidates ?? []),
    ]);
    matchMs = Math.round(performance.now() - t2);

    return {
      id: 'contour',
      label,
      description,
      cropUrl,
      name: match?.name ?? null,
      lang: match?.lang ?? null,
      score: match ? 1 : 0,
      ocrTop: (ocr.candidates ?? []).slice(0, 5),
      locateMs,
      ocrMs,
      matchMs,
      totalMs: Math.round(performance.now() - tAll),
      error: null,
    };
  } catch (e) {
    return {
      id: 'contour',
      label,
      description,
      cropUrl,
      name: null,
      lang: null,
      score: 0,
      ocrTop: [],
      locateMs,
      ocrMs,
      matchMs,
      totalMs: Math.round(performance.now() - tAll),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function runBlobMethod(frame: HTMLCanvasElement): Promise<MethodResult> {
  const label = 'B — Blob + RapidOCR';
  const description = 'Localisation blob sombre adaptative → RapidOCR titre (pipeline live harness)';
  const tAll = performance.now();
  let locateMs = 0;
  let ocrMs = 0;
  let matchMs = 0;
  let cropUrl: string | null = null;
  try {
    const t0 = performance.now();
    const crop = adaptiveCropCard(frame, 350, 490);
    locateMs = Math.round(performance.now() - t0);
    cropUrl = crop.dataUrl;

    const t1 = performance.now();
    const { candidates, ms } = await rapidOcrCardName(crop.canvas);
    ocrMs = ms || Math.round(performance.now() - t1);

    const t2 = performance.now();
    const match = await resolveOcrToDictionaryBestOf(candidates);
    matchMs = Math.round(performance.now() - t2);

    return {
      id: 'blob',
      label,
      description,
      cropUrl,
      name: match?.name ?? null,
      lang: match?.lang ?? null,
      score: match ? 1 : 0,
      ocrTop: candidates.slice(0, 5),
      locateMs,
      ocrMs,
      matchMs,
      totalMs: Math.round(performance.now() - tAll),
      error: null,
    };
  } catch (e) {
    return {
      id: 'blob',
      label,
      description,
      cropUrl,
      name: null,
      lang: null,
      score: 0,
      ocrTop: [],
      locateMs,
      ocrMs,
      matchMs,
      totalMs: Math.round(performance.now() - tAll),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function ResultCard({
  result,
  highlight,
  onVote,
}: {
  result: MethodResult;
  highlight: boolean;
  onVote: () => void;
}) {
  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        highlight
          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
      }`}
    >
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{result.label}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{result.description}</p>
      </div>
      {result.cropUrl ? (
        <img
          src={result.cropUrl}
          alt={`Crop ${result.id}`}
          className="w-full max-w-[220px] mx-auto rounded-lg border border-gray-200 dark:border-gray-600"
        />
      ) : (
        <div className="h-40 flex items-center justify-center text-sm text-gray-400">Pas de crop</div>
      )}
      {result.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
      ) : (
        <>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {result.name ?? '(aucune correspondance)'}
            {result.lang ? (
              <span className="ml-2 text-sm font-normal text-gray-500">[{result.lang}]</span>
            ) : null}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 break-words">
            OCR: {result.ocrTop.map((t) => `"${t}"`).join(' / ') || '—'}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {result.totalMs} ms total
            <span className="text-gray-400">
              {' '}
              (loc {result.locateMs} · ocr {result.ocrMs} · match {result.matchMs})
            </span>
          </p>
        </>
      )}
      <Button variant="secondary" onClick={onVote} className="w-full">
        Celle-ci est meilleure
      </Button>
    </div>
  );
}

export function ScanCompare() {
  const {
    videoRef,
    error: cameraError,
    isReady,
    start,
    stop,
    captureFrame,
  } = useCamera({ facingMode: 'environment' });

  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const [rapidOk, setRapidOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<MethodResult[] | null>(null);
  const [votes, setVotes] = useState<VoteStats>(() => loadVotes());
  const [lastVote, setLastVote] = useState<MethodId | 'tie' | null>(null);

  useEffect(() => {
    preloadDictionary();
    checkRapidOcr().then(setRapidOk);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    let lastRun = 0;

    const tick = async (now: number) => {
      if (cancelled) return;
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (video && overlay && video.readyState >= 2 && now - lastRun > 450) {
        lastRun = now;
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          if (overlay.width !== w) overlay.width = w;
          if (overlay.height !== h) overlay.height = h;
          const ctx = overlay.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, w, h);
            try {
              const tmp = document.createElement('canvas');
              tmp.width = Math.min(640, w);
              const scale = tmp.width / w;
              tmp.height = Math.round(h * scale);
              tmp.getContext('2d')!.drawImage(video, 0, 0, tmp.width, tmp.height);
              const quad = await detectCardEdges(tmp);
              const scaled: Quadrilateral = {
                ...quad,
                points: quad.points.map(([x, y]) => [x / scale, y / scale]) as Quadrilateral['points'],
              };
              drawQuadOnContext(ctx, scaled, '#22c55e');
            } catch {
              /* no contour */
            }
          }
        }
      }
      animRef.current = requestAnimationFrame((t) => void tick(t));
    };
    animRef.current = requestAnimationFrame((t) => void tick(t));
    return () => {
      cancelled = true;
      cancelAnimationFrame(animRef.current);
    };
  }, [isReady, videoRef]);

  const handleCompare = useCallback(async () => {
    const frame = captureFrame();
    if (!frame) return;
    setBusy(true);
    setLastVote(null);
    setResults(null);
    try {
      const [a, b] = await Promise.all([runContourMethod(frame), runBlobMethod(frame)]);
      setResults([a, b]);
    } finally {
      setBusy(false);
    }
  }, [captureFrame]);

  const vote = (which: MethodId | 'tie') => {
    const next = { ...votes };
    next[which] += 1;
    setVotes(next);
    saveVotes(next);
    setLastVote(which);
  };

  const faster =
    results && results[0] && results[1]
      ? results[0].totalMs < results[1].totalMs
        ? results[0].id
        : results[1].totalMs < results[0].totalMs
          ? results[1].id
          : null
      : null;

  const bothNamed =
    results &&
    results[0]?.name &&
    results[1]?.name &&
    results[0].name.localeCompare(results[1].name, 'fr', { sensitivity: 'accent' }) === 0;

  return (
    <div className="page-shell py-4 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Comparaison scan</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
            Même frame webcam, deux pipelines en parallèle. Vote pour accumuler quelle méthode
            gagne le plus souvent.
          </p>
        </div>
        <Link
          to="/scan"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline self-center"
        >
          ← Retour au scan
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <span
          className={`px-2.5 py-1 rounded-full ${
            rapidOk
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
              : rapidOk === false
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          RapidOCR {rapidOk === null ? '…' : rapidOk ? 'OK' : 'indisponible (lance le sidecar)'}
        </span>
        <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
          Votes A {votes.contour} · B {votes.blob} · égalité {votes.tie}
        </span>
      </div>

      <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] max-h-[420px]">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain"
          playsInline
          muted
          autoPlay
        />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 text-white p-4 text-center">
            {cameraError ? (
              <p>{cameraError}</p>
            ) : (
              <Button onClick={() => void start()}>Activer la caméra</Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!isReady ? null : (
          <>
            <Button onClick={() => void handleCompare()} loading={busy} disabled={busy}>
              Comparer sur cette frame
            </Button>
            <Button variant="secondary" onClick={() => stop()} disabled={busy}>
              Couper la caméra
            </Button>
          </>
        )}
        {(votes.contour > 0 || votes.blob > 0 || votes.tie > 0) && (
          <Button
            variant="secondary"
            onClick={() => {
              const cleared = { contour: 0, blob: 0, tie: 0 };
              setVotes(cleared);
              saveVotes(cleared);
              setLastVote(null);
            }}
          >
            Reset votes
          </Button>
        )}
      </div>

      {results && (
        <div className="space-y-4">
          {bothNamed && (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              Les deux méthodes ont trouvé le même nom.
            </p>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            {results.map((r) => (
              <ResultCard
                key={r.id}
                result={r}
                highlight={faster === r.id}
                onVote={() => vote(r.id)}
              />
            ))}
          </div>
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => vote('tie')}>
              Égalité / les deux OK
            </Button>
          </div>
          {lastVote && (
            <p className="text-center text-sm text-gray-500">
              Vote enregistré :{' '}
              {lastVote === 'tie' ? 'égalité' : lastVote === 'contour' ? 'A (contour)' : 'B (blob)'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default ScanCompare;
