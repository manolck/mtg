import bundledCatalog from '../../public/table-mats/index.json';

import { toArtCropUrl } from '../utils/deckArt';

export type PlayMatKind = 'css' | 'image';

export interface PlayMatOption {
  id: string;
  label: string;
  kind: PlayMatKind;
  className?: string;
  swatch?: string;
  imageUrl?: string;
}

/** Images in `public/table-mats/` are served as `/table-mats/<file>`. */
export const PLAY_MATS_DIR = '/table-mats';

export const DEFAULT_PLAY_MAT_ID = 'battlefield';
export const COMMANDER_PLAY_MAT_ID = 'commander';

export const BUILTIN_PLAY_MATS: PlayMatOption[] = [
  {
    id: 'battlefield',
    label: 'Champ de bataille',
    kind: 'css',
    className: 'zone--battlefield',
    swatch: 'linear-gradient(160deg, var(--battlefield-a), var(--battlefield-c))',
  },
  {
    id: 'enchant',
    label: 'Enchantements',
    kind: 'css',
    className: 'zone--enchant',
    swatch: 'linear-gradient(160deg, var(--ench-a), var(--ench-c))',
  },
  {
    id: 'terrain',
    label: 'Terrains',
    kind: 'css',
    className: 'zone--terrain',
    swatch: 'linear-gradient(160deg, var(--terrain-a), var(--terrain-c))',
  },
];

export function isValidPlaymatId(id: string | undefined): id is string {
  if (!id || id.length > 64) return false;
  if (id.includes('..') || id.includes('/') || id.includes('\\')) return false;
  return /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(id);
}

function isSafeMatFile(file: string): boolean {
  if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) return false;
  return /\.(png|jpe?g|webp|avif|svg|gif)$/i.test(file);
}

type MatsIndex = {
  mats?: Array<{ id?: unknown; file?: unknown; label?: unknown }>;
};

function parseImageMats(data: unknown): PlayMatOption[] {
  const mats = data && typeof data === 'object' ? (data as MatsIndex).mats : undefined;
  if (!Array.isArray(mats)) return [];
  const seen = new Set(BUILTIN_PLAY_MATS.map((mat) => mat.id));
  const out: PlayMatOption[] = [];
  for (const raw of mats) {
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const file = typeof raw.file === 'string' ? raw.file.trim() : '';
    const label = typeof raw.label === 'string' ? raw.label.trim() : id;
    if (!isValidPlaymatId(id) || seen.has(id) || !isSafeMatFile(file)) continue;
    seen.add(id);
    const encoded = encodeURIComponent(file);
    out.push({
      id,
      label: label || id,
      kind: 'image',
      imageUrl: `${PLAY_MATS_DIR}/${encoded}`,
      swatch: `center / cover url(${PLAY_MATS_DIR}/${encoded})`,
    });
  }
  return out;
}

let imageMatsCache: PlayMatOption[] | null = null;
let imageMatsPending: Promise<PlayMatOption[]> | null = null;

export function loadImagePlayMats(): Promise<PlayMatOption[]> {
  if (imageMatsCache) return Promise.resolve(imageMatsCache);
  if (imageMatsPending) return imageMatsPending;
  const bundled = parseImageMats(bundledCatalog);
  imageMatsPending = fetch(`${PLAY_MATS_DIR}/index.json`, { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return bundled;
      const parsed = parseImageMats(await res.json());
      return parsed.length > 0 ? parsed : bundled;
    })
    .catch(() => bundled)
    .then((mats) => {
      imageMatsCache = mats;
      return mats;
    })
    .finally(() => {
      imageMatsPending = null;
    });
  return imageMatsPending;
}

export function commanderPlayMat(imageUrl?: string, label?: string): PlayMatOption | null {
  const art = toArtCropUrl(imageUrl) || imageUrl;
  if (!art) return null;
  const safeUrl = art.replace(/"/g, '');
  return {
    id: COMMANDER_PLAY_MAT_ID,
    label: label ? `Commander · ${label}` : 'Commander',
    kind: 'image',
    imageUrl: safeUrl,
    swatch: `center / cover url("${safeUrl}")`,
  };
}

export function resolvePlayMat(
  id: string | undefined,
  imageMats: PlayMatOption[],
  commanderMat?: PlayMatOption | null,
): PlayMatOption {
  if (id && id !== COMMANDER_PLAY_MAT_ID) {
    const found = [...BUILTIN_PLAY_MATS, ...imageMats].find((mat) => mat.id === id);
    if (found) return found;
  }
  if (commanderMat && (!id || id === COMMANDER_PLAY_MAT_ID)) return commanderMat;
  return BUILTIN_PLAY_MATS[0];
}
