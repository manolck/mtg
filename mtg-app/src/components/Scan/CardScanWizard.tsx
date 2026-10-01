import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCamera } from '../../hooks/useCamera';
import { useUserCollections } from '../../hooks/useUserCollections';
import {
  canvasToJpegBlob,
  checkScanHealth,
  scanFrame,
  type ScanCandidate,
} from '../../services/scanService';
import {
  searchCardByScryfallId,
  searchCardBySetAndNumber,
  searchCardByOracleId,
  searchPrintingsByOracleId,
} from '../../services/scryfallApi';
import { searchPrintingsByExactName } from '../../services/scryfallSearchService';
import { fetchSetsWithIcons } from '../../services/scryfallSetIconsService';
import { addCard as addCardToCollection } from '../../services/collectionService';
import { useDecks } from '../../hooks/useDecks';
import { mtgCardToDeckEntry } from '../../utils/deckEntry';
import { detectCardEdges, drawQuadOnContext } from '../../utils/cardEdgeDetection';
import { loadOpenCV } from '../../utils/loadOpenCV';
import { DECK_FORMAT_LABELS, type DeckZone } from '../../types/deck';
import { Button } from '../UI/Button';
import { Spinner } from '../UI/Spinner';
import type { MTGCard } from '../../types/card';

const STABLE_DETECTION_MS = 450;
const DETECTION_INTERVAL_MS = 120;
/** Ne quitter la détection que si un candidat atteint ce score (0–1). */
const MIN_MATCH_SCORE = 0.95;
/** Pause avant de re-capturer auto après un scan trop peu confiant. */
const LOW_CONFIDENCE_COOLDOWN_MS = 900;
type Step = 1 | 2 | 3;

interface ResolvedCandidate {
  candidate: ScanCandidate;
  card: MTGCard | null;
  loading: boolean;
  error: string | null;
  printings: MTGCard[];
  printingsLoading: boolean;
  hintedSet: string | null;
}

interface WizardState {
  step: Step;
  previewUrl: string | null;
  candidates: ResolvedCandidate[];
  selectedCard: MTGCard | null;
  adding: boolean;
  addSuccess: boolean;
  deckAddSuccess: boolean;
  deckAddError: string | null;
  ocrDebug: string | null;
}

const initialState: WizardState = {
  step: 1,
  previewUrl: null,
  candidates: [],
  selectedCard: null,
  adding: false,
  addSuccess: false,
  deckAddSuccess: false,
  deckAddError: null,
  ocrDebug: null,
};

function getSetIconDisplayUrl(iconUri: string): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV && iconUri.startsWith('https://svgs.scryfall.io')) {
    try {
      const u = new URL(iconUri);
      return `/scryfall-icons${u.pathname}${u.search}`;
    } catch {
      return iconUri;
    }
  }
  return iconUri;
}

function SetIconImage({
  iconUri,
  name,
  className,
}: {
  iconUri: string;
  name: string;
  className?: string;
}) {
  const [loadError, setLoadError] = useState(false);
  const displayUrl = getSetIconDisplayUrl(iconUri);
  if (!loadError && displayUrl) {
    return (
      <img
        src={displayUrl}
        alt={name}
        className={className}
        onError={() => setLoadError(true)}
      />
    );
  }
  return (
    <span
      className={`flex items-center justify-center bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs font-medium ${className ?? 'w-10 h-10'}`}
      title={name}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

async function resolveCandidate(c: ScanCandidate): Promise<MTGCard | null> {
  if (c.scryfall_id) {
    const byId = await searchCardByScryfallId(c.scryfall_id, true, { magicCorporation: false });
    if (byId) return byId;
  }
  if (c.set && c.collector_number) {
    const bySet = await searchCardBySetAndNumber(c.set, c.collector_number, true);
    if (bySet) return bySet;
  }
  if (c.oracle_id) {
    const byOracle = await searchCardByOracleId(c.oracle_id, true);
    if (byOracle) return byOracle;
  }
  const name = c.printed_name || c.name;
  if (name) {
    const prints = await searchPrintingsByExactName(
      name,
      3,
      c.lang === 'fr' ? 'fr' : undefined,
      c.set || undefined
    );
    if (prints.length) {
      if (c.set) {
        const match = prints.find((p) => p.set?.toLowerCase() === c.set!.toLowerCase());
        if (match) return match;
      }
      return prints[0];
    }
  }
  return null;
}

async function loadPrintingsForCandidate(rc: ResolvedCandidate): Promise<MTGCard[]> {
  if (rc.candidate.oracle_id) {
    const prints = await searchPrintingsByOracleId(rc.candidate.oracle_id, true, 120);
    if (prints.length) return prints;
  }
  const englishOrPrinted = rc.card?.name || rc.candidate.name || rc.candidate.printed_name;
  if (englishOrPrinted) {
    const fr = await searchPrintingsByExactName(englishOrPrinted, 80, 'fr');
    if (fr.length) return fr;
    const en = await searchPrintingsByExactName(englishOrPrinted, 80, 'en');
    if (en.length) return en;
    return searchPrintingsByExactName(englishOrPrinted, 80);
  }
  return rc.card ? [rc.card] : [];
}

export function CardScanWizard() {
  const { currentUser } = useAuth();
  const { decks, addCardToDeck, createDeck } = useDecks();
  const { collections, createCollection } = useUserCollections();
  const [state, setState] = useState<WizardState>(initialState);
  const [targetCollectionId, setTargetCollectionId] = useState<string>('');
  const [targetDeckId, setTargetDeckId] = useState<string>('');
  const [deckZone, setDeckZone] = useState<DeckZone>('mainboard');
  const [addingToDeck, setAddingToDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [sidecarOk, setSidecarOk] = useState<boolean | null>(null);
  const [setIconByCode, setSetIconByCode] = useState<Record<string, string>>({});
  const [cardDetected, setCardDetected] = useState(false);
  const [opencvReady, setOpencvReady] = useState(false);
  const [opencvError, setOpencvError] = useState<string | null>(null);

  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef(0);
  const lastDetectionTimeRef = useRef(0);
  const detectionStableSinceRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const detectionBusyRef = useRef(false);
  const handleCaptureAndScanRef = useRef<() => Promise<void>>(async () => {});
  const nextAutoCaptureAllowedAtRef = useRef(0);

  const {
    videoRef,
    error: cameraError,
    isReady: cameraReady,
    start: startCamera,
    stop: stopCamera,
    captureFrame,
  } = useCamera({ facingMode: 'environment' });

  useEffect(() => {
    if (!collections.length) return;
    setTargetCollectionId((prev) =>
      prev && collections.some((c) => c.id === prev) ? prev : collections[0].id
    );
  }, [collections]);

  useEffect(() => {
    let cancelled = false;
    checkScanHealth().then((h) => {
      if (!cancelled) setSidecarOk(h.ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSetsWithIcons()
      .then((sets) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const s of sets) {
          if (s.code && s.icon_svg_uri) map[s.code.toLowerCase()] = s.icon_svg_uri;
        }
        setSetIconByCode(map);
      })
      .catch(() => {
        /* icons optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCaptureAndScan = useCallback(async () => {
    if (scanningRef.current) return;
    const canvas = captureFrame();
    if (!canvas) {
      setScanError('Impossible de capturer la frame caméra.');
      return;
    }
    scanningRef.current = true;
    setScanning(true);
    setScanError(null);
    detectionStableSinceRef.current = null;
    setCardDetected(false);
    stopCamera();
    try {
      const blob = await canvasToJpegBlob(canvas, 0.92);
      const previewUrl = URL.createObjectURL(blob);
      const result = await scanFrame(blob);
      const confident = (result.candidates || [])
        .filter((c) => (c.score ?? 0) >= MIN_MATCH_SCORE)
        .slice(0, 3);

      if (confident.length === 0) {
        const best = (result.candidates || [])[0];
        const bestPct = best ? Math.round((best.score ?? 0) * 100) : 0;
        const hint = result.ocr?.title || result.ocr?.full_joined || '—';
        setScanError(
          best
            ? `Confiance insuffisante (${bestPct}% < 95%). Recadrez — OCR : ${hint}`
            : `Pas de match ≥ 95%. Recadrez la carte — OCR : ${hint}`
        );
        nextAutoCaptureAllowedAtRef.current = Date.now() + LOW_CONFIDENCE_COOLDOWN_MS;
        detectionStableSinceRef.current = null;
        startCamera();
        return;
      }

      const resolved: ResolvedCandidate[] = confident.map((c) => ({
        candidate: c,
        card: null,
        loading: true,
        error: null,
        printings: [],
        printingsLoading: true,
        hintedSet: (c.set || null)?.toLowerCase() ?? null,
      }));
      setState({
        ...initialState,
        step: 2,
        previewUrl: result.warped_jpeg || previewUrl,
        candidates: resolved,
        ocrDebug: result.ocr
          ? `Titre: ${result.ocr.title || '—'} · Bas: ${result.ocr.set || '?'}/${result.ocr.collector_number || '?'} · ${result.ocr.method || '—'}${
              result.ocr.strategy ? ` · ${result.ocr.strategy}` : ''
            }${result.ocr.full_joined ? ` · full: ${result.ocr.full_joined.slice(0, 80)}` : ''}${
              result.timings_ms?.total_ms != null ? ` · ${result.timings_ms.total_ms} ms` : ''
            }`
          : null,
      });
      setScanError(null);

      const settled = await Promise.all(
        confident.map(async (c) => {
          const hintedSet = (c.set || null)?.toLowerCase() ?? null;
          try {
            const card = await resolveCandidate(c);
            const rc: ResolvedCandidate = {
              candidate: c,
              card,
              loading: false,
              error: card ? null : 'Carte introuvable sur Scryfall',
              printings: [],
              printingsLoading: true,
              hintedSet: hintedSet || (card?.set || null)?.toLowerCase() || null,
            };
            let printings: MTGCard[] = [];
            try {
              printings = await loadPrintingsForCandidate(rc);
              if (!printings.length && card) printings = [card];
              const hint = rc.hintedSet;
              printings = [...printings].sort((a, b) => {
                const aHint = hint && a.set?.toLowerCase() === hint ? 0 : 1;
                const bHint = hint && b.set?.toLowerCase() === hint ? 0 : 1;
                return aHint - bHint;
              });
            } catch {
              if (card) printings = [card];
            }
            return {
              ...rc,
              printings,
              printingsLoading: false,
            } satisfies ResolvedCandidate;
          } catch (err) {
            return {
              candidate: c,
              card: null,
              loading: false,
              error: err instanceof Error ? err.message : 'Erreur Scryfall',
              printings: [],
              printingsLoading: false,
              hintedSet,
            } satisfies ResolvedCandidate;
          }
        })
      );
      setState((s) => ({ ...s, candidates: settled }));
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan échoué');
      nextAutoCaptureAllowedAtRef.current = Date.now() + LOW_CONFIDENCE_COOLDOWN_MS;
      startCamera();
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [captureFrame, stopCamera, startCamera]);

  useEffect(() => {
    handleCaptureAndScanRef.current = handleCaptureAndScan;
  }, [handleCaptureAndScan]);

  useEffect(() => {
    let cancelled = false;
    loadOpenCV()
      .then(() => {
        if (!cancelled) {
          setOpencvReady(true);
          setOpencvError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOpencvReady(false);
          setOpencvError(err instanceof Error ? err.message : 'OpenCV indisponible');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runDetection = useCallback(async () => {
    if (scanningRef.current || detectionBusyRef.current) return;
    detectionBusyRef.current = true;
    try {
      const canvas = captureFrame();
      if (!canvas) return;
      lastDetectionTimeRef.current = Date.now();
      const result = await detectCardEdges(canvas);
      const hasCard = result.hasCardProportions === true;
      setCardDetected(hasCard);

      const overlay = overlayCanvasRef.current;
      const video = videoRef.current;
      if (overlay && video) {
        const w = video.videoWidth || canvas.width;
        const h = video.videoHeight || canvas.height;
        if (w && h && (overlay.width !== w || overlay.height !== h)) {
          overlay.width = w;
          overlay.height = h;
        }
        const ctx = overlay.getContext('2d');
        if (ctx && overlay.width > 0 && overlay.height > 0) {
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          if (hasCard) {
            // Même repère que captureFrame (pas de miroir CSS) → contour aligné sur l'affichage
            drawQuadOnContext(ctx, result, {
              strokeStyle: '#22c55e',
              lineWidth: Math.max(4, Math.round(overlay.width / 200)),
              fillStyle: 'rgba(34, 197, 94, 0.2)',
            });
          }
        }
      }

      if (Date.now() < nextAutoCaptureAllowedAtRef.current) {
        detectionStableSinceRef.current = null;
        return;
      }

      if (hasCard) {
        const now = Date.now();
        if (detectionStableSinceRef.current === null) {
          detectionStableSinceRef.current = now;
        } else if (now - detectionStableSinceRef.current >= STABLE_DETECTION_MS) {
          detectionStableSinceRef.current = null;
          void handleCaptureAndScanRef.current();
        }
      } else {
        detectionStableSinceRef.current = null;
      }
    } finally {
      detectionBusyRef.current = false;
    }
  }, [captureFrame, videoRef]);

  useEffect(() => {
    if (state.step !== 1 || !cameraReady || scanning) return;
    let mounted = true;
    const tick = async () => {
      if (!mounted) return;
      const now = Date.now();
      if (now - lastDetectionTimeRef.current >= DETECTION_INTERVAL_MS) {
        await runDetection();
      }
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [state.step, cameraReady, scanning, runDetection]);

  useEffect(() => {
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    if (!video || !overlay || !cameraReady) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w && h && (overlay.width !== w || overlay.height !== h)) {
      overlay.width = w;
      overlay.height = h;
    }
  }, [cameraReady, videoRef]);

  const handleSelectEdition = useCallback((card: MTGCard) => {
    setState((s) => ({
      ...s,
      selectedCard: card,
      step: 3,
      addSuccess: false,
      deckAddSuccess: false,
    }));
  }, []);

  const handleAddToCollection = useCallback(async () => {
    const card = state.selectedCard;
    const uid = currentUser?.uid;
    if (!card || !uid) return;
    setState((s) => ({ ...s, adding: true }));
    try {
      let collectionId: string | undefined = targetCollectionId || collections[0]?.id;
      if (!collectionId) {
        const created = await createCollection('Ma collection');
        collectionId = created?.id;
      }
      if (!collectionId) {
        throw new Error('Impossible de créer ou sélectionner une collection');
      }
      await addCardToCollection({
        userId: uid,
        collectionId,
        name: card.name,
        quantity: 1,
        set: card.set,
        setCode: card.set,
        collectorNumber: card.number,
        rarity: card.rarity,
        condition: undefined,
        language: 'en',
        mtgData: card,
        backImageUrl: undefined,
        backMultiverseid: undefined,
        backMtgData: undefined,
      });
      setState((s) => ({ ...s, adding: false, addSuccess: true }));
    } catch (err) {
      setState((s) => ({ ...s, adding: false }));
      throw err;
    }
  }, [state.selectedCard, currentUser?.uid, targetCollectionId, collections, createCollection]);

  const handleAddToDeck = useCallback(async () => {
    const card = state.selectedCard;
    if (!card || !currentUser) return;
    setAddingToDeck(true);
    setState((s) => ({ ...s, deckAddError: null }));
    try {
      let deckId = targetDeckId;
      if (!deckId) {
        if (!newDeckName.trim()) {
          setState((s) => ({
            ...s,
            deckAddError: 'Choisissez un deck ou saisissez un nom pour en créer un.',
          }));
          setAddingToDeck(false);
          return;
        }
        deckId = await createDeck({ name: newDeckName.trim(), format: 'modern' });
        setTargetDeckId(deckId);
      }
      const entry = mtgCardToDeckEntry(card, 1);
      await addCardToDeck(deckId, entry, 1, deckZone);
      setState((s) => ({ ...s, deckAddSuccess: true, deckAddError: null }));
    } catch (err) {
      setState((s) => ({
        ...s,
        deckAddError: err instanceof Error ? err.message : "Impossible d'ajouter au deck",
      }));
    } finally {
      setAddingToDeck(false);
    }
  }, [state.selectedCard, currentUser, targetDeckId, newDeckName, deckZone, createDeck, addCardToDeck]);

  const handleScanAnother = useCallback(() => {
    setState(initialState);
    setTargetDeckId('');
    setNewDeckName('');
    setDeckZone('mainboard');
    setScanError(null);
    startCamera();
  }, [startCamera]);

  const isLoggedIn = !!currentUser;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="page-title">Scanner une carte</h1>

      {state.step === 1 && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Cadrez la carte : le contour vert indique la détection, la capture part automatiquement. L&apos;identification
            passe par le sidecar Python.
          </p>
          {sidecarOk === false && (
            <p className="text-amber-600 dark:text-amber-400 text-sm">
              Sidecar RapidOCR non détecté. Lancez <code className="text-xs">npm run ocr:sidecar</code> avant de scanner.
            </p>
          )}
          <div className="relative inline-block max-w-full rounded-lg overflow-hidden bg-black mx-auto">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="block max-w-full max-h-[70vh] h-auto"
            />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
            {!cameraReady && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 min-h-[240px] min-w-[320px]">
                <p className="text-white text-center px-4">
                  Cliquez sur le bouton ci-dessous pour activer la caméra.
                </p>
              </div>
            )}
            {cameraReady && !scanning && (
              <div className="absolute bottom-0 left-0 right-0 pointer-events-none bg-gradient-to-t from-black/75 to-transparent px-3 py-3">
                <p className="text-white text-center text-sm">
                  {!opencvReady && !opencvError && 'Chargement OpenCV…'}
                  {opencvError && `Détection limitée : ${opencvError}`}
                  {opencvReady && !cardDetected && 'Placez une carte — le contour vert apparaît à la détection.'}
                  {opencvReady && cardDetected && 'Contour détecté — capture automatique…'}
                </p>
              </div>
            )}
            {scanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="flex items-center gap-2 text-white">
                  <Spinner /> Analyse…
                </div>
              </div>
            )}
          </div>
          {!cameraReady && !cameraError && (
            <Button onClick={startCamera}>Activer la caméra</Button>
          )}
          {cameraError && <p className="text-red-600 dark:text-red-400">{cameraError}</p>}
          {scanError && <p className="text-amber-600 dark:text-amber-400 text-sm">{scanError}</p>}
          {cameraReady && (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {cardDetected
                  ? 'Carte détectée — capture automatique…'
                  : 'Capture auto dès contour stable ; on ne passe à la suite qu’avec un match ≥ 95 %.'}
              </p>
              <Button
                onClick={() => void handleCaptureAndScan()}
                loading={scanning}
                disabled={scanning}
              >
                {scanning ? 'Analyse…' : 'Capturer maintenant'}
              </Button>
            </>
          )}
        </div>
      )}

      {state.step === 2 && (
        <div className="space-y-4">
          {state.previewUrl && (
            <img
              src={state.previewUrl}
              alt="Carte scannée"
              className="max-w-full max-h-56 object-contain rounded-lg border border-gray-300 dark:border-gray-600 block"
            />
          )}
          {state.ocrDebug && (
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{state.ocrDebug}</p>
          )}

          <p className="text-gray-600 dark:text-gray-400">
            Choisissez la carte et son extension (icônes).
          </p>
          {state.candidates.length === 0 && (
            <p className="text-amber-600 dark:text-amber-400">
              Aucun candidat trouvé
              {state.ocrDebug ? ` — OCR : ${state.ocrDebug}` : ''}.
              Recadrez la carte bien à plat, titre et bas visibles, puis réessayez.
            </p>
          )}
          <ul className="space-y-4">
            {state.candidates.map((rc, i) => {
              const label =
                rc.candidate.printed_name ||
                rc.candidate.name ||
                rc.card?.name ||
                `Candidat ${i + 1}`;
              const meta = [
                rc.candidate.lang,
                rc.candidate.method,
                `${Math.round((rc.candidate.score || 0) * 100)}%`,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <li
                  key={`${rc.candidate.scryfall_id || rc.candidate.oracle_id || label}-${i}`}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 space-y-3"
                >
                  <div className="flex items-center gap-3">
                    {rc.card?.imageUrl ? (
                      <img
                        src={rc.card.imageUrl}
                        alt={label}
                        className="w-16 h-auto rounded border border-gray-200 dark:border-gray-600"
                      />
                    ) : (
                      <div className="w-16 h-22 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded">
                        {rc.loading ? <Spinner /> : null}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{meta}</p>
                      {rc.error && <p className="text-xs text-amber-600 mt-1">{rc.error}</p>}
                    </div>
                  </div>

                  {rc.printingsLoading && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Spinner /> Extensions…
                    </div>
                  )}
                  {!rc.printingsLoading && rc.printings.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {rc.printings.map((p) => {
                        const code = (p.set || '').toLowerCase();
                        const iconUri = setIconByCode[code];
                        const hinted = Boolean(rc.hintedSet && code === rc.hintedSet);
                        return (
                          <button
                            key={`${code}-${p.number}-${p.id}`}
                            type="button"
                            title={`${p.setName || p.set} · #${p.number}`}
                            onClick={() => handleSelectEdition(p)}
                            className={`p-2 rounded-lg border-2 transition-colors flex flex-col items-center gap-1 min-w-[4rem] ${
                              hinted
                                ? 'border-amber-500 bg-amber-100 dark:bg-amber-900/30'
                                : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 hover:border-amber-400'
                            }`}
                          >
                            {iconUri ? (
                              <SetIconImage
                                iconUri={iconUri}
                                name={p.setName || code}
                                className="w-9 h-9 object-contain"
                              />
                            ) : (
                              <span className="w-9 h-9 flex items-center justify-center text-xs font-semibold uppercase bg-gray-200 dark:bg-gray-600 rounded">
                                {code.slice(0, 3) || '?'}
                              </span>
                            )}
                            <span className="text-[11px] text-gray-600 dark:text-gray-300 font-medium uppercase">
                              {code || '—'}
                            </span>
                            <span className="text-[10px] text-gray-500">#{p.number}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {!rc.printingsLoading && !rc.printings.length && rc.card && (
                    <Button size="sm" onClick={() => handleSelectEdition(rc.card!)}>
                      Continuer avec cette impression
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>

          <Button
            variant="secondary"
            onClick={() => {
              setState(initialState);
              startCamera();
            }}
          >
            Retour
          </Button>
        </div>
      )}

      {state.step === 3 && state.selectedCard && (
        <div className="space-y-4">
          {state.addSuccess || state.deckAddSuccess ? (
            <>
              <p className="text-green-600 dark:text-green-400 font-medium">
                {state.addSuccess && state.deckAddSuccess
                  ? 'Carte ajoutée à la collection et au deck.'
                  : state.addSuccess
                    ? 'Carte ajoutée à la collection.'
                    : 'Carte ajoutée au deck.'}
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={handleScanAnother}>Scanner une autre carte</Button>
                {state.deckAddSuccess && targetDeckId && (
                  <Link to={`/decks/${targetDeckId}`}>
                    <Button variant="secondary">Ouvrir le deck</Button>
                  </Link>
                )}
                <Link to="/collection">
                  <Button variant="secondary">Retour à la collection</Button>
                </Link>
              </div>
            </>
          ) : !isLoggedIn ? (
            <>
              <div className="flex flex-col sm:flex-row items-start gap-4">
                {state.selectedCard.imageUrl && (
                  <img
                    src={state.selectedCard.imageUrl}
                    alt={state.selectedCard.name}
                    className="w-32 sm:w-40 rounded-lg border border-gray-300 dark:border-gray-600"
                  />
                )}
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{state.selectedCard.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {state.selectedCard.setName || state.selectedCard.set} · {state.selectedCard.number}
                  </p>
                </div>
              </div>
              <p className="text-amber-600 dark:text-amber-400">
                Connectez-vous pour ajouter cette carte à votre collection.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Link to="/login">
                  <Button>Se connecter</Button>
                </Link>
                <Button variant="secondary" onClick={handleScanAnother}>
                  Scanner une autre carte
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setState((s) => ({ ...s, step: 2, selectedCard: null }))}
                >
                  Retour
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-start gap-4">
                {state.selectedCard.imageUrl && (
                  <img
                    src={state.selectedCard.imageUrl}
                    alt={state.selectedCard.name}
                    className="w-32 sm:w-40 rounded-lg border border-gray-300 dark:border-gray-600"
                  />
                )}
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{state.selectedCard.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {state.selectedCard.setName || state.selectedCard.set} · {state.selectedCard.number}
                  </p>
                  {collections.length > 1 && (
                    <label className="mt-2 block text-sm text-gray-700 dark:text-gray-300">
                      Collection
                      <select
                        className="mt-1 block w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                        value={targetCollectionId}
                        onChange={(e) => setTargetCollectionId(e.target.value)}
                      >
                        {collections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={handleAddToCollection}
                  loading={state.adding}
                  disabled={state.adding || addingToDeck}
                >
                  Ajouter à la collection
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setState((s) => ({ ...s, step: 2, selectedCard: null }))}
                  disabled={state.adding || addingToDeck}
                >
                  Retour
                </Button>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
                <h3 className="font-semibold text-gray-900 dark:text-white">Ajouter au deck</h3>
                {decks.length > 0 ? (
                  <select
                    value={targetDeckId}
                    onChange={(e) => setTargetDeckId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">— Choisir un deck —</option>
                    {decks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({DECK_FORMAT_LABELS[d.format]})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-500">Aucun deck — créez-en un ci-dessous.</p>
                )}
                <input
                  type="text"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder="Ou créer un nouveau deck (nom)"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <select
                  value={deckZone}
                  onChange={(e) => setDeckZone(e.target.value as DeckZone)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="mainboard">Mainboard</option>
                  <option value="sideboard">Sideboard</option>
                  <option value="maybeboard">Maybeboard</option>
                  <option value="commanders">Commanders</option>
                </select>
                {state.deckAddError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{state.deckAddError}</p>
                )}
                <Button
                  onClick={() => void handleAddToDeck()}
                  loading={addingToDeck}
                  disabled={state.adding || addingToDeck || (!targetDeckId && !newDeckName.trim())}
                >
                  Ajouter au deck
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
