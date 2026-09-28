export type PlayMatKind = 'css' | 'image';

export interface PlayMatOption {
  id: string;
  label: string;
  kind: PlayMatKind;
  className?: string;
  swatch?: string;
  imageUrl?: string;
}

/** Images dropped in this public folder are served as `/play/mats/<file>`. */
export const PLAY_MATS_DIR = '/play/mats';

export const DEFAULT_PLAY_MAT_ID = 'battlefield';

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

const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const FILE_RE = /^[a-z0-9][a-z0-9._-]*\.(png|jpe?g|webp|avif|svg|gif)$/i;

export function isValidPlaymatId(id: string | undefined): id is string {
  return Boolean(id && ID_RE.test(id));
}

function isSafeMatFile(file: string): boolean {
  return FILE_RE.test(file) && !file.includes('..') && !file.includes('/') && !file.includes('\\');
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
    out.push({
      id,
      label: label || id,
      kind: 'image',
      imageUrl: `${PLAY_MATS_DIR}/${encodeURIComponent(file)}`,
      swatch: `center / cover url(${PLAY_MATS_DIR}/${encodeURIComponent(file)})`,
    });
  }
  return out;
}

let imageMatsCache: PlayMatOption[] | null = null;
let imageMatsPending: Promise<PlayMatOption[]> | null = null;

export function loadImagePlayMats(): Promise<PlayMatOption[]> {
  if (imageMatsCache) return Promise.resolve(imageMatsCache);
  if (imageMatsPending) return imageMatsPending;
  imageMatsPending = fetch(`${PLAY_MATS_DIR}/index.json`, { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return [];
      return parseImageMats(await res.json());
    })
    .catch(() => [])
    .then((mats) => {
      imageMatsCache = mats;
      return mats;
    })
    .finally(() => {
      imageMatsPending = null;
    });
  return imageMatsPending;
}

export function resolvePlayMat(id: string | undefined, imageMats: PlayMatOption[]): PlayMatOption {
  const all = [...BUILTIN_PLAY_MATS, ...imageMats];
  return all.find((mat) => mat.id === id) || BUILTIN_PLAY_MATS[0];
}
