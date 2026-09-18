export const DFC_LAYOUTS = new Set([
  'transform',
  'modal_dfc',
  'double_faced_token',
  'art_series',
  'reversible_card',
]);

export interface DfcBack {
  backImageUrl: string;
  backName?: string;
  backTypeLine?: string;
}

type ImageUris = {
  normal?: string;
  large?: string;
  png?: string;
  border_crop?: string;
};

function imageFromUris(uris?: ImageUris | null): string | undefined {
  return uris?.normal || uris?.large || uris?.png || uris?.border_crop;
}

export function isDfcLayout(layout?: string): boolean {
  return Boolean(layout && DFC_LAYOUTS.has(layout));
}

export function extractDfcBack(scryfallCard: {
  layout?: string;
  card_faces?: Array<{ name?: string; type_line?: string; image_uris?: ImageUris }>;
}): DfcBack | null {
  if (!isDfcLayout(scryfallCard.layout)) return null;
  const back = scryfallCard.card_faces?.[1];
  const backImageUrl = imageFromUris(back?.image_uris);
  if (!backImageUrl) return null;
  return {
    backImageUrl,
    backName: back?.name,
    ...(back?.type_line ? { backTypeLine: back.type_line } : {}),
  };
}

const cache = new Map<string, DfcBack | null>();

export async function fetchDfcBacks(ids: string[]): Promise<Record<string, DfcBack>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const missing = unique.filter((id) => !cache.has(id));

  if (missing.length > 0) {
    const { fetchWithRetry } = await import('./fetchWithRetry');
    const { scryfallQueue } = await import('./apiQueue');

    for (let i = 0; i < missing.length; i += 75) {
      const chunk = missing.slice(i, i + 75);
      try {
        const response = await scryfallQueue.enqueue(
          () =>
            fetchWithRetry(
              'https://api.scryfall.com/cards/collection',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                  'User-Agent': 'MTGCollectionApp/1.0',
                },
                body: JSON.stringify({ identifiers: chunk.map((id) => ({ id })) }),
              },
              { maxRetries: 2, initialDelay: 400, maxDelay: 4000, retryableStatuses: [429, 500, 502, 503, 504] },
            ),
          'normal',
        );
        if (!response.ok) {
          chunk.forEach((id) => cache.set(id, null));
          continue;
        }
        const payload = (await response.json()) as {
          data?: Array<{ id: string; layout?: string; card_faces?: Array<{ name?: string; type_line?: string; image_uris?: ImageUris }> }>;
        };
        for (const card of payload.data || []) {
          cache.set(card.id, extractDfcBack(card));
        }
        for (const id of chunk) {
          if (!cache.has(id)) cache.set(id, null);
        }
      } catch {
        chunk.forEach((id) => cache.set(id, null));
      }
    }
  }

  const result: Record<string, DfcBack> = {};
  for (const id of unique) {
    const value = cache.get(id);
    if (value?.backImageUrl) result[id] = value;
  }
  return result;
}
