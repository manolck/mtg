/**
 * Client RapidOCR (sidecar local, proxy Vite `/rapidocr`).
 */

export type RapidOcrResult = {
  texts: string[];
  nameTexts: string[];
  nameJoined: string;
  joined: string;
  ms: number;
};

function clean(text: string): string {
  return (text ?? '')
    .replace(/[|\[\](){}«»<>]/g, ' ')
    .replace(/[^\p{L}\p{N}\s'\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function letterScore(text: string): number {
  const letters = (text.match(/\p{L}/gu) || []).length;
  const words = text.split(/\s+/).filter((w) => /[\p{L}]{3,}/u.test(w)).length;
  return letters + words * 4;
}

export function rapidOcrBaseUrl(): string {
  return ((import.meta.env.VITE_RAPIDOCR_URL as string | undefined) || '/rapidocr').replace(
    /\/$/,
    ''
  );
}

export async function checkRapidOcr(timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(`${rapidOcrBaseUrl()}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function rapidOcrFromCanvas(canvas: HTMLCanvasElement): Promise<RapidOcrResult> {
  const t0 = performance.now();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) {
    return { texts: [], nameTexts: [], nameJoined: '', joined: '', ms: 0 };
  }
  const res = await fetch(`${rapidOcrBaseUrl()}/ocr`, {
    method: 'POST',
    body: blob,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`RapidOCR ${res.status}`);
  }
  const data = (await res.json()) as {
    texts?: string[];
    name_texts?: string[];
    name_joined?: string;
    joined?: string;
  };
  const texts = (data.texts ?? []).map(clean).filter((t) => t.length >= 3);
  const nameTexts = (data.name_texts ?? []).map(clean).filter((t) => t.length >= 3);
  return {
    texts,
    nameTexts,
    nameJoined: clean(data.name_joined ?? ''),
    joined: clean(data.joined ?? ''),
    ms: Math.round(performance.now() - t0),
  };
}

/** OCR bandeau titre puis carte entière si besoin. */
export async function rapidOcrCardName(cardCanvas: HTMLCanvasElement): Promise<{
  candidates: string[];
  ms: number;
}> {
  const t0 = performance.now();
  const w = cardCanvas.width;
  const h = cardCanvas.height;
  const title = document.createElement('canvas');
  const tw = Math.max(8, Math.floor(w * 0.8));
  const th = Math.max(8, Math.floor(h * 0.12));
  title.width = tw;
  title.height = th;
  const tctx = title.getContext('2d')!;
  tctx.drawImage(
    cardCanvas,
    Math.floor(w * 0.04),
    Math.floor(h * 0.015),
    tw,
    th,
    0,
    0,
    tw,
    th
  );

  const add = (set: Set<string>, t: string) => {
    const c = clean(t);
    if (c.length >= 4 && letterScore(c) >= 6) set.add(c);
  };
  const primary = new Set<string>();

  const titleRes = await rapidOcrFromCanvas(title);
  for (const t of titleRes.nameTexts.length ? titleRes.nameTexts : titleRes.texts) add(primary, t);
  if (titleRes.nameJoined) add(primary, titleRes.nameJoined);

  const strong =
    [...primary].some((t) => letterScore(t) >= 12) &&
    [...primary].some((t) => t.split(/\s+/).filter((w) => /[\p{L}]{4,}/u.test(w)).length >= 2);

  if (!strong) {
    const full = await rapidOcrFromCanvas(cardCanvas);
    for (const t of full.nameTexts.length ? full.nameTexts : full.texts.slice(0, 2)) {
      add(primary, t);
    }
    if (full.nameJoined) add(primary, full.nameJoined);
    if (full.nameTexts.length >= 2) add(primary, full.nameTexts.slice(0, 2).join(' '));
  }

  const candidates = [...primary].sort((a, b) => letterScore(b) - letterScore(a));
  return { candidates, ms: Math.round(performance.now() - t0) };
}
