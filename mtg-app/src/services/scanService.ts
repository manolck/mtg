/**
 * Thin client for the RapidOCR Python scan sidecar (POST /scan via Vite proxy).
 */

export type ScanCandidate = {
  oracle_id: string | null;
  lang: string | null;
  name: string | null;
  printed_name: string | null;
  scryfall_id: string | null;
  set?: string | null;
  collector_number?: string | null;
  score: number;
  method: string;
};

export type ScanResult = {
  candidates: ScanCandidate[];
  timings_ms?: Record<string, number>;
  ocr?: {
    title?: string;
    bottom?: string;
    set?: string | null;
    collector_number?: string | null;
    method?: string | null;
    strategy?: string | null;
    full_joined?: string | null;
  };
  warped_jpeg?: string | null;
  located?: boolean;
};

const SIDECAR_HINT =
  'Sidecar RapidOCR indisponible. Lancez `npm run ocr:sidecar` (port 5201), puis réessayez.';

function scanErrorMessage(status: number, bodyText: string): string {
  if (status === 502 || status === 0) return SIDECAR_HINT;
  if (status === 404 || status === 405) {
    return `${SIDECAR_HINT} (HTTP ${status})`;
  }
  try {
    const j = JSON.parse(bodyText) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* ignore */
  }
  return bodyText || `Erreur scan HTTP ${status}`;
}

/** GET /rapidocr/health */
export async function checkScanHealth(): Promise<{
  ok: boolean;
  prints_keys?: number;
  names_keys?: number;
  error?: string;
}> {
  try {
    const res = await fetch('/rapidocr/health', { method: 'GET' });
    if (!res.ok) {
      return { ok: false, error: scanErrorMessage(res.status, await res.text()) };
    }
    const data = (await res.json()) as {
      ok?: boolean;
      prints_keys?: number;
      names_keys?: number;
    };
    return {
      ok: data.ok === true,
      prints_keys: data.prints_keys,
      names_keys: data.names_keys,
    };
  } catch {
    return { ok: false, error: SIDECAR_HINT };
  }
}

/** POST /rapidocr/scan — JPEG/PNG frame blob */
export async function scanFrame(blob: Blob): Promise<ScanResult> {
  let res: Response;
  try {
    res = await fetch('/rapidocr/scan', {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'image/jpeg' },
      body: blob,
    });
  } catch {
    throw new Error(SIDECAR_HINT);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(scanErrorMessage(res.status, text));
  }
  try {
    return JSON.parse(text) as ScanResult;
  } catch {
    throw new Error('Réponse scan invalide');
  }
}

/** Capture current video frame as JPEG blob. */
export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Échec encodage JPEG'))),
      'image/jpeg',
      quality
    );
  });
}
