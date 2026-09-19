import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCamera } from '../../hooks/useCamera';
import { useUserCollections } from '../../hooks/useUserCollections';
import { detectCardEdges, drawQuadOnContext, type Quadrilateral } from '../../utils/cardEdgeDetection';
import { rectifyCardToCanvas } from '../../utils/rectifyCard';
import { extractCardNameWithOCR, CARD_NAME_REGION } from '../../utils/cardOcr';
import { searchPrintingsByExactName } from '../../services/scryfallSearchService';
import { getEnglishNameForSearch, findBestMatchingCardName } from '../../services/magicCorporationService';
import {
  matchCardLogoToSets,
  defaultLogoMatchOptions,
  type LogoRegion,
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
import { useDecks } from '../../hooks/useDecks';
import { mtgCardToDeckEntry } from '../../utils/deckEntry';
import { DECK_FORMAT_LABELS, type DeckZone } from '../../types/deck';
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

/** Zone logo d'extension fixe (pas d'overlay UI) — utilisée uniquement après résolution du nom. */
const LOGO_REGION: LogoRegion = { x: 0.82, y: 0.54, width: 0.13, height: 0.08 };

interface WizardState {
  step: Step;
  contourPoints: Quadrilateral | null;
  contourPointsInCrop: [number, number][] | null;
  cropWidth: number;
  cropHeight: number;
  croppedImageUrl: string | null;
  detectedName: string;
  /** Si résolu via le dictionnaire Scryfall, permet d'utiliser le nom anglais pour la recherche. */
  detectedOracleId: string | null;
  detectedSetCode: string | null;
  detectedSetName: string | null;
  setMatches: SetMatch[];
  searchResults: MTGCard[];
  selectedCard: MTGCard | null;
  adding: boolean;
  addSuccess: boolean;
  /** Message after add-to-deck (optional parallel path) */
  deckAddSuccess: boolean;
  deckAddError: string | null;
}

const initialState: WizardState = {
  step: 1,
  contourPoints: null,
  contourPointsInCrop: null,
  cropWidth: 0,
  cropHeight: 0,
  croppedImageUrl: null,
  detectedName: '',
  detectedOracleId: null,
  detectedSetCode: null,
  detectedSetName: null,
  setMatches: [],
  searchResults: [],
  selectedCard: null,
  adding: false,
  addSuccess: false,
  deckAddSuccess: false,
  deckAddError: null,
};

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
  const { decks, addCardToDeck, createDeck } = useDecks();
  const { collections, createCollection } = useUserCollections();
  const [state, setState] = useState<WizardState>(initialState);
  const [targetCollectionId, setTargetCollectionId] = useState<string>('');
  const [targetDeckId, setTargetDeckId] = useState<string>('');
  const [deckZone, setDeckZone] = useState<DeckZone>('mainboard');
  const [addingToDeck, setAddingToDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
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
    if (!collections.length) return;
    setTargetCollectionId((prev) =>
      prev && collections.some((c) => c.id === prev) ? prev : collections[0].id
    );
  }, [collections]);

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
      detectedName: '',
      detectedOracleId: null,
      detectedSetCode: null,
      detectedSetName: null,
      setMatches: [],
      selectedCard: null,
      addSuccess: false,
      deckAddSuccess: false,
      deckAddError: null,
    }));
  }, [captureFrame, stopCamera]);

  const handleValidateDetectionRef = useRef(handleValidateDetection);
  useEffect(() => {
    handleValidateDetectionRef.current = handleValidateDetection;
  }, [handleValidateDetection]);

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
    const t = setTimeout(() => {
      setOcrLoading(true);
      setOcrError(null);
      extractCardNameWithOCR(imageUrl, CARD_NAME_REGION)
        .then(async (result) => {
          let fromDict: Awaited<ReturnType<typeof resolveOcrToDictionaryBestOf>> = null;
          try {
            fromDict = await resolveOcrToDictionaryBestOf([
              result.textAuto,
              result.textInverted,
              ...(result.candidates ?? []),
            ]);
          } catch {
            // Dictionnaire indisponible (ex. 404), on utilise le fallback Magic Corporation
          }
          if (fromDict) {
            setState((s) => ({
              ...s,
              detectedName: fromDict.name,
              detectedOracleId: fromDict.oracle_id,
              setMatches: [],
              detectedSetCode: null,
              detectedSetName: null,
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
            setMatches: [],
            detectedSetCode: null,
            detectedSetName: null,
          }));
        })
        .catch((err) => {
          setOcrError(err instanceof Error ? err.message : 'OCR failed');
        })
        .finally(() => setOcrLoading(false));
    }, OCR_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [state.step, state.croppedImageUrl]);

  const [logoMatchLoading, setLogoMatchLoading] = useState(false);
  const [logoMatchError, setLogoMatchError] = useState<string | null>(null);
  const [saveCardLoading, setSaveCardLoading] = useState(false);
  const [saveCardError, setSaveCardError] = useState<string | null>(null);

  const LOGO_SEARCH_DEBOUNCE_MS = 400;

  /** Recherche d'extension uniquement après qu'un nom de carte ait été trouvé / saisi. */
  useEffect(() => {
    if (state.step !== 2 || !state.croppedImageUrl || ocrLoading) return;
    const name = state.detectedName.trim();
    if (!name) return;

    const imageUrl = state.croppedImageUrl;
    const oracleId = state.detectedOracleId;
    let cancelled = false;
    const t = setTimeout(() => {
      setLogoMatchLoading(true);
      setLogoMatchError(null);
      void (async () => {
        try {
          const cardNameEnglish = oracleId
            ? (getEnglishNameForOracleId(oracleId) ?? name)
            : (await getEnglishNameForSearch(name)) ?? name;
          const matches = await matchCardLogoToSets(
            imageUrl,
            LOGO_REGION,
            10,
            { ...defaultLogoMatchOptions, useNameFilter: true },
            cardNameEnglish || undefined
          );
          if (cancelled) return;
          setState((s) => ({
            ...s,
            setMatches: matches,
            detectedSetCode: matches[0]?.set.code ?? null,
            detectedSetName: matches[0]?.set.name ?? null,
          }));
        } catch (err) {
          if (cancelled) return;
          setLogoMatchError(err instanceof Error ? err.message : 'Recherche extension échouée');
        } finally {
          if (!cancelled) setLogoMatchLoading(false);
        }
      })();
    }, LOGO_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [state.step, state.croppedImageUrl, state.detectedName, state.detectedOracleId, ocrLoading]);

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
      let collectionId = targetCollectionId || collections[0]?.id;
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
  }, [
    state.selectedCard,
    currentUser?.uid,
    targetCollectionId,
    collections,
    createCollection,
  ]);

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
  }, [
    state.selectedCard,
    currentUser,
    targetDeckId,
    newDeckName,
    deckZone,
    createDeck,
    addCardToDeck,
  ]);

  const handleScanAnother = useCallback(() => {
    setState(initialState);
    setTargetDeckId('');
    setNewDeckName('');
    setDeckZone('mainboard');
    startCamera();
  }, [startCamera]);

  const isLoggedIn = !!currentUser;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="page-title">
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

      {/* Step 2: Nom puis extension automatiquement ; clic sur l’édition → sauvegarde */}
      {state.step === 2 && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Vérifiez le nom. L&apos;extension est recherchée ensuite automatiquement — cliquez sur le logo pour enregistrer.
          </p>
          {state.croppedImageUrl && (
            <>
              <img
                src={state.croppedImageUrl}
                alt="Carte cadrée"
                className="max-w-full max-h-64 object-contain rounded-lg border border-gray-300 dark:border-gray-600 block"
              />
              {ocrLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Spinner /> Lecture du nom…
                </div>
              )}
              {ocrError && <p className="text-amber-600 dark:text-amber-400">{ocrError}</p>}
              <div ref={nameAutocompleteRef} className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom de la carte</label>
                <input
                  type="text"
                  value={state.detectedName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setState((s) => ({
                      ...s,
                      detectedName: value,
                      detectedOracleId: null,
                      setMatches: [],
                      detectedSetCode: null,
                      detectedSetName: null,
                    }));
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
                      <li key={`${entry.oracle_id}-${entry.lang}-${entry.name}`} role="option" className="px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700 last:border-b-0" onMouseDown={(e) => { e.preventDefault(); setState((s) => ({ ...s, detectedName: entry.name, detectedOracleId: entry.oracle_id, setMatches: [], detectedSetCode: null, detectedSetName: null })); setNameSuggestions([]); }}>
                        {entry.name}{entry.lang !== 'en' && <span className="ml-2 text-xs text-gray-500">({entry.lang})</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {logoMatchLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Spinner /> Recherche de l&apos;extension…
                </div>
              )}
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
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setState((s) => ({ ...s, step: 1 }))}>Retour</Button>
          </div>
        </div>
      )}

      {/* Step 3: Sauvegarde (ajout à la collection) */}
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
              <div className="flex flex-col sm:flex-row items-start gap-4">
                {state.selectedCard.imageUrl && (
                  <img
                    src={state.selectedCard.imageUrl}
                    alt={state.selectedCard.name}
                    className="w-32 sm:w-40 rounded-lg border border-gray-300 dark:border-gray-600"
                  />
                )}
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {state.selectedCard.name}
                  </p>
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
                  onClick={() => setState((s) => ({ ...s, step: 2 }))}
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
