import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCamera } from '../../hooks/useCamera';
import { detectCardEdges, drawQuadOnContext, type Quadrilateral } from '../../utils/cardEdgeDetection';
import { rectifyCardToCanvas } from '../../utils/rectifyCard';
import { extractCardNameWithOCR, CARD_NAME_REGION, type NameRegion } from '../../utils/cardOcr';
import { searchPrintingsByExactName } from '../../services/scryfallSearchService';
import { getEnglishNameForSearch, findBestMatchingCardName } from '../../services/magicCorporationService';
import {
  matchCardLogoToSets,
  defaultLogoMatchOptions,
  type LogoRegion,
  type LogoMatchOptions,
  type SetMatch,
} from '../../services/scryfallSetIconsService';
import {
  resolveOcrToDictionaryBestOf,
  getEnglishNameForOracleId,
  preloadDictionary,
  searchCardNamesForAutocomplete,
} from '../../services/scryfallDictionaryService';
import type { ScryfallDictionaryEntry } from '../../services/scryfallDictionaryService';
import { addCard as addCardToCollection } from '../../services/collectionService';
import { Button } from '../UI/Button';
import { Spinner } from '../UI/Spinner';
import type { MTGCard } from '../../types/card';

/** En dev, utilise le proxy Vite pour contourner CORS sur les icônes Scryfall. */
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

/** Affiche l’icône du set (proxy en dev pour CORS) avec initiales en secours. */
function SetIconImage({ iconUri, name, className }: { iconUri: string; name: string; className?: string }) {
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

type Step = 1 | 2 | 3;

/** Zone logo d'extension par défaut : 82%, 54%, 13%, 8%. */
const DEFAULT_LOGO_REGION: LogoRegion = { x: 0.82, y: 0.54, width: 0.13, height: 0.08 };

interface WizardState {
  step: Step;
  contourPoints: Quadrilateral | null;
  contourPointsInCrop: [number, number][] | null;
  cropWidth: number;
  cropHeight: number;
  croppedImageUrl: string | null;
  /** Zone de lecture du titre (0–1). Ajustable par sliders, utilisée pour l’overlay et l’OCR. */
  nameRegion: NameRegion;
  detectedName: string;
  /** Si résolu via le dictionnaire Scryfall, permet d'utiliser le nom anglais pour la recherche. */
  detectedOracleId: string | null;
  /** Zone de recherche du logo d'extension (0–1), déplaçable. */
  logoRegion: LogoRegion;
  detectedSetCode: string | null;
  detectedSetName: string | null;
  setMatches: SetMatch[];
  searchResults: MTGCard[];
  selectedCard: MTGCard | null;
  adding: boolean;
  addSuccess: boolean;
}

const defaultNameRegion: NameRegion = { ...CARD_NAME_REGION };

const initialState: WizardState = {
  step: 1,
  contourPoints: null,
  contourPointsInCrop: null,
  cropWidth: 0,
  cropHeight: 0,
  croppedImageUrl: null,
  nameRegion: defaultNameRegion,
  detectedName: '',
  detectedOracleId: null,
  logoRegion: { ...DEFAULT_LOGO_REGION },
  detectedSetCode: null,
  detectedSetName: null,
  setMatches: [],
  searchResults: [],
  selectedCard: null,
  adding: false,
  addSuccess: false,
};

/** Identifie TL, TR, BR, BL à partir des 4 points du quad (carte éventuellement de travers) */
function orderCardCorners(points: [number, number][]): { tl: [number, number]; tr: [number, number]; br: [number, number]; bl: [number, number] } {
  const byY = [...points].sort((a, b) => a[1] - b[1]);
  const [top0, top1] = byY.slice(0, 2);
  const [bot0, bot1] = byY.slice(2, 4);
  const tl = top0[0] < top1[0] ? top0 : top1;
  const tr = top0[0] < top1[0] ? top1 : top0;
  const bl = bot0[0] < bot1[0] ? bot0 : bot1;
  const br = bot0[0] < bot1[0] ? bot1 : bot0;
  return { tl, tr, br, bl };
}

/** Zone titre : parallèle au bord supérieur de la carte, selon region (x, y, width, height en 0–1) */
function getTitleZoneQuad(cardPoints: [number, number][], region: NameRegion): [number, number][] {
  if (cardPoints.length !== 4) return [];
  const { tl, tr, br, bl } = orderCardCorners(cardPoints);
  const { x, y, width, height } = region;
  const topLeft = [tl[0] + y * (bl[0] - tl[0]), tl[1] + y * (bl[1] - tl[1])] as [number, number];
  const topRight = [tr[0] + y * (br[0] - tr[0]), tr[1] + y * (br[1] - tr[1])] as [number, number];
  const p0: [number, number] = [topLeft[0] + x * (topRight[0] - topLeft[0]), topLeft[1] + x * (topRight[1] - topLeft[1])];
  const p1: [number, number] = [topLeft[0] + (x + width) * (topRight[0] - topLeft[0]), topLeft[1] + (x + width) * (topRight[1] - topLeft[1])];
  const botLeft = [tl[0] + (y + height) * (bl[0] - tl[0]), tl[1] + (y + height) * (bl[1] - tl[1])] as [number, number];
  const botRight = [tr[0] + (y + height) * (br[0] - tr[0]), tr[1] + (y + height) * (br[1] - tr[1])] as [number, number];
  const r0: [number, number] = [botLeft[0] + x * (botRight[0] - botLeft[0]), botLeft[1] + x * (botRight[1] - botLeft[1])];
  const r1: [number, number] = [botLeft[0] + (x + width) * (botRight[0] - botLeft[0]), botLeft[1] + (x + width) * (botRight[1] - botLeft[1])];
  return [p0, p1, r1, r0];
}

/** Crop canvas to the axis-aligned bounding box of the quad */
function cropCanvasToQuad(canvas: HTMLCanvasElement, quad: Quadrilateral): HTMLCanvasElement {
  const xs = quad.points.map((p) => p[0]);
  const ys = quad.points.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(canvas.width, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(canvas.height, Math.ceil(Math.max(...ys)));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (ctx) ctx.drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
  return out;
}

export function CardScanWizard() {
  const { currentUser } = useAuth();
  const [state, setState] = useState<WizardState>(initialState);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number>(0);
  const lastQuadRef = useRef<Quadrilateral | null>(null);
  const [lastDetectionHasCardProportions, setLastDetectionHasCardProportions] = useState(false);
  /** Début de la détection continue (carte détectée) pour passage auto après STABLE_DETECTION_MS */
  const detectionStableSinceRef = useRef<number | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<ScryfallDictionaryEntry[]>([]);
  const nameAutocompleteRef = useRef<HTMLDivElement>(null);
  const nameAutocompleteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    videoRef,
    error: cameraError,
    isReady: cameraReady,
    start: startCamera,
    stop: stopCamera,
    captureFrame,
  } = useCamera({ facingMode: 'environment' });

  useEffect(() => {
    preloadDictionary();
  }, []);

  useEffect(() => {
    if (nameSuggestions.length === 0) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        nameAutocompleteRef.current &&
        !nameAutocompleteRef.current.contains(e.target as Node)
      ) {
        setNameSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [nameSuggestions.length]);

  const RECTIFY_WIDTH = 223;
  const RECTIFY_HEIGHT = 311;

  const handleValidateDetection = useCallback(async () => {
    const canvas = captureFrame();
    const quad = lastQuadRef.current;
    if (!canvas || !quad) return;
    detectionStableSinceRef.current = null;
    stopCamera();
    let croppedCanvas: HTMLCanvasElement;
    let cropWidth: number;
    let cropHeight: number;
    let contourPointsInCrop: [number, number][];
    try {
      croppedCanvas = await rectifyCardToCanvas(canvas, quad, RECTIFY_WIDTH, RECTIFY_HEIGHT);
      cropWidth = RECTIFY_WIDTH;
      cropHeight = RECTIFY_HEIGHT;
      contourPointsInCrop = [
        [0, 0],
        [RECTIFY_WIDTH, 0],
        [RECTIFY_WIDTH, RECTIFY_HEIGHT],
        [0, RECTIFY_HEIGHT],
      ];
    } catch {
      const xs = quad.points.map((p) => p[0]);
      const ys = quad.points.map((p) => p[1]);
      const x0 = Math.max(0, Math.floor(Math.min(...xs)));
      const y0 = Math.max(0, Math.floor(Math.min(...ys)));
      const x1 = Math.min(canvas.width, Math.ceil(Math.max(...xs)));
      const y1 = Math.min(canvas.height, Math.ceil(Math.max(...ys)));
      cropWidth = Math.max(1, x1 - x0);
      cropHeight = Math.max(1, y1 - y0);
      contourPointsInCrop = quad.points.map(([px, py]) => [px - x0, py - y0]) as [number, number][];
      croppedCanvas = cropCanvasToQuad(canvas, quad);
    }
    const dataUrl = croppedCanvas.toDataURL('image/jpeg', 0.92);
    setState((s) => ({
      ...s,
      step: 2,
      contourPoints: quad,
      contourPointsInCrop,
      cropWidth,
      cropHeight,
      croppedImageUrl: dataUrl,
    }));
  }, [captureFrame, stopCamera]);

  const handleValidateDetectionRef = useRef(handleValidateDetection);
  handleValidateDetectionRef.current = handleValidateDetection;

  /** Détection continue pendant ce délai (ms) avant passage automatique à l'étape 2 */
  const STABLE_DETECTION_MS = 500;
  /** Délai minimum (ms) entre deux exécutions de détection pour laisser le temps au traitement */
  const DETECTION_INTERVAL_MS = 120;

  // Step 1: run edge detection and draw overlay uniquement si les proportions correspondent à une carte MTG (63×88 mm)
  const lastDetectionTimeRef = useRef<number>(0);
  const runDetection = useCallback(async () => {
    const canvas = captureFrame();
    if (!canvas) return;
    lastDetectionTimeRef.current = Date.now();
    const result = await detectCardEdges(canvas);
    lastQuadRef.current = result;
    setLastDetectionHasCardProportions(result.hasCardProportions === true);

    if (result.hasCardProportions) {
      const now = Date.now();
      if (detectionStableSinceRef.current === null) {
        detectionStableSinceRef.current = now;
      } else if (now - detectionStableSinceRef.current >= STABLE_DETECTION_MS) {
        detectionStableSinceRef.current = null;
        handleValidateDetectionRef.current();
        return;
      }
    } else {
      detectionStableSinceRef.current = null;
    }

    const overlay = overlayCanvasRef.current;
    if (overlay) {
      const ctx = overlay.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        if (result.hasCardProportions) {
          drawQuadOnContext(ctx, result, { strokeStyle: '#00ff00', lineWidth: 4 });
        }
      }
    }
  }, [captureFrame]);

  useEffect(() => {
    if (state.step !== 1 || !cameraReady) return;
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
  }, [state.step, cameraReady, runDetection]);

  // Resize overlay to match video
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

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const OCR_DEBOUNCE_MS = 450;
  const AUTOCOMPLETE_DEBOUNCE_MS = 250;

  useEffect(() => {
    if (state.step !== 2 || !state.croppedImageUrl) return;
    const imageUrl = state.croppedImageUrl;
    const region = state.nameRegion;
    const t = setTimeout(() => {
      setOcrLoading(true);
      setOcrError(null);
      extractCardNameWithOCR(imageUrl, region)
        .then(async (result) => {
          let fromDict: Awaited<ReturnType<typeof resolveOcrToDictionaryBestOf>> = null;
          try {
            fromDict = await resolveOcrToDictionaryBestOf([
              result.textAuto,
              result.textInverted,
            ]);
          } catch {
            // Dictionnaire indisponible (ex. 404), on utilise le fallback Magic Corporation
          }
          if (fromDict) {
            setState((s) => ({
              ...s,
              detectedName: fromDict.name,
              detectedOracleId: fromDict.oracle_id,
            }));
            return;
          }
          const corrected = await findBestMatchingCardName(result.text);
          const displayName = corrected
            ? (corrected.nameVf || corrected.nameVo || result.text)
            : result.text;
          setState((s) => ({
            ...s,
            detectedName: displayName,
            detectedOracleId: null,
          }));
        })
        .catch((err) => {
          setOcrError(err instanceof Error ? err.message : 'OCR failed');
        })
        .finally(() => setOcrLoading(false));
    }, OCR_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [state.step, state.croppedImageUrl, state.nameRegion]);

  const [logoMatchLoading, setLogoMatchLoading] = useState(false);
  const [logoMatchError, setLogoMatchError] = useState<string | null>(null);
  const [logoMatchOptions, setLogoMatchOptions] = useState<LogoMatchOptions>(() => ({ ...defaultLogoMatchOptions }));
  const [logoOptionsOpen, setLogoOptionsOpen] = useState(false);
  const [saveCardLoading, setSaveCardLoading] = useState(false);
  const [saveCardError, setSaveCardError] = useState<string | null>(null);

  const handleSearchSetLogo = useCallback(async () => {
    if (!state.croppedImageUrl) return;
    setLogoMatchLoading(true);
    setLogoMatchError(null);
    const cardNameEnglish = state.detectedOracleId
      ? (getEnglishNameForOracleId(state.detectedOracleId) ?? state.detectedName)
      : await getEnglishNameForSearch(state.detectedName).then((n) => n ?? state.detectedName);
    matchCardLogoToSets(
      state.croppedImageUrl,
      state.logoRegion,
      10,
      logoMatchOptions,
      cardNameEnglish || undefined
    )
      .then((matches) => {
        setState((s) => ({
          ...s,
          setMatches: matches,
          detectedSetCode: matches[0]?.set.code ?? null,
          detectedSetName: matches[0]?.set.name ?? null,
        }));
      })
      .catch((err) => {
        setLogoMatchError(err instanceof Error ? err.message : 'Recherche extension échouée');
      })
      .finally(() => setLogoMatchLoading(false));
  }, [state.croppedImageUrl, state.logoRegion, state.detectedName, state.detectedOracleId, logoMatchOptions]);

  /** Au clic sur une édition : recherche nom+set puis passage à la sauvegarde. */
  const handleSelectEdition = useCallback(
    async (setCode: string, setName: string) => {
      if (!state.detectedName.trim()) return;
      setSaveCardError(null);
      setSaveCardLoading(true);
      const name = state.detectedName.trim();
      const englishName = state.detectedOracleId
        ? (getEnglishNameForOracleId(state.detectedOracleId) ?? name)
        : await getEnglishNameForSearch(name).then((n) => n ?? name);
      searchPrintingsByExactName(englishName ?? name, 5, undefined, setCode)
        .then((cards) => {
          if (cards.length > 0) {
            const card = cards.find((c) => c.set?.toLowerCase() === setCode.toLowerCase()) ?? cards[0];
            setState((s) => ({ ...s, selectedCard: card, detectedSetCode: setCode, detectedSetName: setName, step: 3 }));
          } else {
            setSaveCardError(`Aucune carte trouvée pour "${name}" dans ${setName}.`);
          }
        })
        .catch((err) => {
          setSaveCardError(err instanceof Error ? err.message : 'Recherche échouée');
        })
        .finally(() => setSaveCardLoading(false));
    },
    [state.detectedName, state.detectedOracleId]
  );

  const handleAddToCollection = useCallback(async () => {
    const card = state.selectedCard;
    const uid = currentUser?.uid;
    if (!card || !uid) return;
    setState((s) => ({ ...s, adding: true }));
    try {
      await addCardToCollection({
        userId: uid,
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
  }, [state.selectedCard, currentUser?.uid]);

  const handleScanAnother = useCallback(() => {
    setState(initialState);
    startCamera();
  }, [startCamera]);

  const isLoggedIn = !!currentUser;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        Scanner une carte
      </h1>

      {/* Step 1: Camera + edge detection — la vidéo est toujours rendue pour que le ref existe au clic sur "Activer la caméra" */}
      {state.step === 1 && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Cadrez la carte dans le cadre. Le contour vert indique la détection. Validez quand la carte est bien détectée.
          </p>
          <div className="relative inline-block rounded-lg overflow-hidden bg-black w-full min-h-[240px]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="block max-w-full max-h-[70vh] w-full min-h-[240px] object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ transform: 'scaleX(-1)' }}
            />
            {!cameraReady && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                <p className="text-white text-center px-4">
                  Cliquez sur le bouton ci-dessous pour activer la caméra.
                </p>
              </div>
            )}
            {cameraReady && !lastDetectionHasCardProportions && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <p className="text-white text-center px-4 text-sm">
                  Placez une carte dans le cadre (bord blanc ou noir).<br />
                  La détection continue automatiquement.
                </p>
              </div>
            )}
          </div>
          {!cameraReady && !cameraError && (
            <Button onClick={startCamera}>Activer la caméra</Button>
          )}
          {cameraError && (
            <p className="text-red-600 dark:text-red-400">{cameraError}</p>
          )}
          {cameraReady && (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {lastDetectionHasCardProportions
                  ? 'Carte détectée — passage automatique dans 0,2 s (ou cliquez ci-dessous).'
                  : 'Ou validez manuellement une fois la carte bien cadrée.'}
              </p>
              <Button
                onClick={handleValidateDetection}
                disabled={!lastDetectionHasCardProportions}
                title={lastDetectionHasCardProportions ? undefined : 'Cadrez une carte MTG pour activer la validation'}
              >
                Valider la détection
              </Button>
            </>
          )}
        </div>
      )}

      {/* Step 2: Nom + édition sur la même image ; clic sur l’édition → sauvegarde */}
      {state.step === 2 && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Vérifiez le nom, choisissez l&apos;édition en cliquant sur le logo. Le clic sur l&apos;édition enregistre la carte.
          </p>
          {state.croppedImageUrl && (
            <>
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="relative shrink-0 max-w-full">
                  <img
                    src={state.croppedImageUrl}
                    alt="Carte cadrée"
                    className="max-w-full max-h-64 object-contain rounded-lg border border-gray-300 dark:border-gray-600 block"
                  />
                  {/* Zone titre */}
                  {state.contourPointsInCrop && state.cropWidth > 0 && state.cropHeight > 0 ? (
                    (() => {
                      const titleZone = getTitleZoneQuad(state.contourPointsInCrop, state.nameRegion);
                      if (titleZone.length !== 4) return null;
                      const pointsStr = titleZone.map(([x, y]) => `${x},${y}`).join(' ');
                      const strokeW = Math.max(1, (state.cropWidth + state.cropHeight) / 300);
                      const fontSize = Math.max(10, state.cropWidth / 40);
                      return (
                        <svg
                          className="absolute inset-0 w-full h-full pointer-events-none"
                          viewBox={`0 0 ${state.cropWidth} ${state.cropHeight}`}
                          preserveAspectRatio="xMidYMid meet"
                          aria-hidden
                        >
                          <defs>
                            <linearGradient id="titleZoneFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0" stopColor="rgb(34, 211, 238)" stopOpacity="0.25" />
                              <stop offset="1" stopColor="rgb(34, 211, 238)" stopOpacity="0.1" />
                            </linearGradient>
                          </defs>
                          <polygon points={pointsStr} fill="url(#titleZoneFill)" stroke="rgb(34, 211, 238)" strokeWidth={strokeW} />
                          <text x={titleZone[0][0] + 4} y={titleZone[0][1] + fontSize} fill="rgb(34, 211, 238)" fontSize={fontSize} fontWeight="500">Titre</text>
                        </svg>
                      );
                    })()
                  ) : (
                    <div
                      className="absolute border-2 border-cyan-400 bg-cyan-400/20 pointer-events-none rounded"
                      style={{ left: `${state.nameRegion.x * 100}%`, top: `${state.nameRegion.y * 100}%`, width: `${state.nameRegion.width * 100}%`, height: `${state.nameRegion.height * 100}%` }}
                      aria-hidden
                    />
                  )}
                  {/* Zone logo */}
                  <div
                    className="absolute border-2 border-amber-400 bg-amber-400/25 pointer-events-none rounded"
                    style={{
                      left: `${state.logoRegion.x * 100}%`,
                      top: `${state.logoRegion.y * 100}%`,
                      width: `${state.logoRegion.width * 100}%`,
                      height: `${state.logoRegion.height * 100}%`,
                    }}
                    aria-hidden
                  />
                </div>
                <div className="w-full sm:w-52 shrink-0 space-y-3 rounded-lg border border-gray-200 dark:border-gray-600 p-3 bg-gray-50 dark:bg-gray-800/50">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block">Zone titre</span>
                  {[{ key: 'x' as const, label: 'X', min: 0, max: 0.4 }, { key: 'y' as const, label: 'Y', min: 0, max: 0.3 }, { key: 'width' as const, label: 'Larg.', min: 0.3, max: 1 }, { key: 'height' as const, label: 'Haut.', min: 0.04, max: 0.25 }].map(({ key, label, min, max }) => (
                    <div key={key}>
                      <label className="flex justify-between text-xs text-gray-600 dark:text-gray-400"><span>{label}</span><span>{Math.round(state.nameRegion[key] * 100)}%</span></label>
                      <input type="range" min={min} max={max} step={0.01} value={state.nameRegion[key]} onChange={(e) => setState((s) => ({ ...s, nameRegion: { ...s.nameRegion, [key]: parseFloat(e.target.value) } }))} className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 dark:bg-gray-600 accent-cyan-500" />
                    </div>
                  ))}
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block pt-1">Zone logo</span>
                  {[{ key: 'x' as const, label: 'X', min: 0, max: 0.9 }, { key: 'y' as const, label: 'Y', min: 0, max: 0.85 }, { key: 'width' as const, label: 'Larg.', min: 0.05, max: 0.5 }, { key: 'height' as const, label: 'Haut.', min: 0.03, max: 0.25 }].map(({ key, label, min, max }) => (
                    <div key={key}>
                      <label className="flex justify-between text-xs text-gray-600 dark:text-gray-400"><span>{label}</span><span>{Math.round(state.logoRegion[key] * 100)}%</span></label>
                      <input type="range" min={min} max={max} step={0.01} value={state.logoRegion[key]} onChange={(e) => setState((s) => ({ ...s, logoRegion: { ...s.logoRegion, [key]: parseFloat(e.target.value) } }))} className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 dark:bg-gray-600 accent-amber-500" />
                    </div>
                  ))}
                  <button type="button" onClick={() => setLogoOptionsOpen((o) => !o)} className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline">{logoOptionsOpen ? '− Options' : '+ Options'}</button>
                  {logoOptionsOpen && (
                    <div className="space-y-2 pt-1 border-t border-gray-200 dark:border-gray-600">
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={logoMatchOptions.useNameFilter} onChange={(e) => setLogoMatchOptions((o) => ({ ...o, useNameFilter: e.target.checked }))} className="rounded accent-amber-500" />Filtre par nom</label>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={logoMatchOptions.useNormalization} onChange={(e) => setLogoMatchOptions((o) => ({ ...o, useNormalization: e.target.checked }))} className="rounded accent-amber-500" />Normalisation</label>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={logoMatchOptions.useBinarization} onChange={(e) => setLogoMatchOptions((o) => ({ ...o, useBinarization: e.target.checked }))} className="rounded accent-amber-500" />Binarisation</label>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={logoMatchOptions.useMultiScale} onChange={(e) => setLogoMatchOptions((o) => ({ ...o, useMultiScale: e.target.checked }))} className="rounded accent-amber-500" />Multi-échelle</label>
                      <div className="flex items-center gap-2 text-xs"><span>Taille:</span><select value={logoMatchOptions.iconSize} onChange={(e) => setLogoMatchOptions((o) => ({ ...o, iconSize: Number(e.target.value) as 32 | 64 }))} className="rounded border bg-white dark:bg-gray-800">{[32, 64].map((n) => <option key={n} value={n}>{n}×{n}</option>)}</select></div>
                      <div className="flex items-center gap-2 text-xs"><span>Métrique:</span><select value={logoMatchOptions.metric} onChange={(e) => setLogoMatchOptions((o) => ({ ...o, metric: e.target.value as 'mse' | 'gradient' }))} className="rounded border bg-white dark:bg-gray-800"><option value="mse">MSE</option><option value="gradient">Gradient</option></select></div>
                    </div>
                  )}
                  <Button onClick={() => void handleSearchSetLogo()} disabled={logoMatchLoading} loading={logoMatchLoading}>Rechercher l&apos;extension</Button>
                </div>
              </div>
              {ocrLoading && <Spinner />}
              {ocrError && <p className="text-amber-600 dark:text-amber-400">{ocrError}</p>}
              <div ref={nameAutocompleteRef} className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom de la carte</label>
                <input
                  type="text"
                  value={state.detectedName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setState((s) => ({ ...s, detectedName: value, detectedOracleId: null }));
                    if (nameAutocompleteDebounceRef.current) clearTimeout(nameAutocompleteDebounceRef.current);
                    if (!value.trim()) { setNameSuggestions([]); return; }
                    nameAutocompleteDebounceRef.current = setTimeout(() => { searchCardNamesForAutocomplete(value, 15).then(setNameSuggestions); nameAutocompleteDebounceRef.current = null; }, AUTOCOMPLETE_DEBOUNCE_MS);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Escape') setNameSuggestions([]); }}
                  onFocus={() => { if (state.detectedName.trim()) searchCardNamesForAutocomplete(state.detectedName, 15).then(setNameSuggestions); }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  placeholder="Nom de la carte"
                  autoComplete="off"
                />
                {nameSuggestions.length > 0 && (
                  <ul className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-auto rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg" role="listbox">
                    {nameSuggestions.map((entry) => (
                      <li key={`${entry.oracle_id}-${entry.lang}-${entry.name}`} role="option" className="px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700 last:border-b-0" onMouseDown={(e) => { e.preventDefault(); setState((s) => ({ ...s, detectedName: entry.name, detectedOracleId: entry.oracle_id })); setNameSuggestions([]); }}>
                        {entry.name}{entry.lang !== 'en' && <span className="ml-2 text-xs text-gray-500">({entry.lang})</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {logoMatchError && <p className="text-amber-600 dark:text-amber-400">{logoMatchError}</p>}
              {saveCardLoading && <Spinner />}
              {saveCardError && <p className="text-red-600 dark:text-red-400">{saveCardError}</p>}
              {state.setMatches.length > 0 && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 bg-gray-50 dark:bg-gray-800/50">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Cliquez sur l&apos;édition pour enregistrer la carte</span>
                  <div className="flex flex-wrap gap-3">
                    {state.setMatches.map((m) => (
                      <button
                        key={m.set.code}
                        type="button"
                        title={m.set.name}
                        disabled={saveCardLoading || !state.detectedName.trim()}
                        onClick={() => void handleSelectEdition(m.set.code, m.set.name)}
                        className={`p-2 rounded-lg border-2 transition-colors flex flex-col items-center gap-1 ${state.detectedSetCode === m.set.code ? 'border-amber-500 bg-amber-100 dark:bg-amber-900/30' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-amber-400'}`}
                      >
                        <SetIconImage iconUri={m.set.icon_svg_uri} name={m.set.name} className="w-10 h-10 object-contain" />
                        <span className="text-xs text-gray-500 dark:text-gray-400">{Math.round(m.score * 100)} %</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setState((s) => ({ ...s, step: 1 }))}>Retour</Button>
          </div>
        </div>
      )}

      {/* Step 3: Sauvegarde (ajout à la collection) */}
      {state.step === 3 && state.selectedCard && (
        <div className="space-y-4">
          {state.addSuccess ? (
            <>
              <p className="text-green-600 dark:text-green-400 font-medium">
                Carte ajoutée à la collection.
              </p>
              <div className="flex gap-2">
                <Button onClick={handleScanAnother}>Scanner une autre carte</Button>
                <Link to="/collection">
                  <Button variant="secondary">Retour à la collection</Button>
                </Link>
              </div>
            </>
          ) : !isLoggedIn ? (
            <>
              <div className="flex items-start gap-4">
                {state.selectedCard.imageUrl && (
                  <img
                    src={state.selectedCard.imageUrl}
                    alt={state.selectedCard.name}
                    className="w-40 rounded-lg border border-gray-300 dark:border-gray-600"
                  />
                )}
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {state.selectedCard.name}
                  </p>
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
                <Button variant="secondary" onClick={() => setState((s) => ({ ...s, step: 2 }))}>
                  Retour
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-4">
                {state.selectedCard.imageUrl && (
                  <img
                    src={state.selectedCard.imageUrl}
                    alt={state.selectedCard.name}
                    className="w-40 rounded-lg border border-gray-300 dark:border-gray-600"
                  />
                )}
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {state.selectedCard.name}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {state.selectedCard.setName || state.selectedCard.set} · {state.selectedCard.number}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddToCollection}
                  loading={state.adding}
                  disabled={state.adding}
                >
                  Ajouter à la collection
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setState((s) => ({ ...s, step: 2 }))}
                  disabled={state.adding}
                >
                  Retour
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
