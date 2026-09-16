import type { DeckEntry } from '../types/deck';
import type { OwnershipRow } from '../hooks/useDeckOwnership';
import { getCardPriceFromMTGJSON } from '../services/mtgjsonPriceServiceAPI';

export interface ShoppingListItem {
  entry: DeckEntry;
  missingQty: number;
  unitPriceUsd: number | null;
  totalPriceUsd: number | null;
}

export interface ShoppingList {
  items: ShoppingListItem[];
  totalMissing: number;
  estimatedTotalUsd: number | null;
  pricedCount: number;
}

/** Build shopping list rows from ownership missing (prices filled async separately). */
export function buildShoppingListRows(missing: OwnershipRow[]): Omit<ShoppingListItem, 'unitPriceUsd' | 'totalPriceUsd'>[] {
  return missing
    .filter((r) => r.missingQty > 0)
    .map((r) => ({
      entry: r.entry,
      missingQty: r.missingQty,
    }));
}

export async function priceShoppingList(
  rows: Omit<ShoppingListItem, 'unitPriceUsd' | 'totalPriceUsd'>[]
): Promise<ShoppingList> {
  const items: ShoppingListItem[] = [];
  let estimatedTotalUsd = 0;
  let pricedCount = 0;
  let anyPrice = false;

  for (const row of rows) {
    let unit: number | null = null;
    try {
      const p = await getCardPriceFromMTGJSON(row.entry.name, row.entry.setCode);
      const usd = p?.usd ? parseFloat(p.usd) : NaN;
      if (!Number.isNaN(usd)) {
        unit = usd;
        estimatedTotalUsd += usd * row.missingQty;
        pricedCount++;
        anyPrice = true;
      }
    } catch {
      /* ignore */
    }
    items.push({
      ...row,
      unitPriceUsd: unit,
      totalPriceUsd: unit != null ? Math.round(unit * row.missingQty * 100) / 100 : null,
    });
  }

  return {
    items,
    totalMissing: items.reduce((s, i) => s + i.missingQty, 0),
    estimatedTotalUsd: anyPrice ? Math.round(estimatedTotalUsd * 100) / 100 : null,
    pricedCount,
  };
}

export function exportShoppingListText(list: ShoppingList, deckName: string): string {
  const lines = [
    `# Shopping list — ${deckName}`,
    `# ${list.totalMissing} carte(s) manquante(s)`,
    list.estimatedTotalUsd != null ? `# Estimation ~$${list.estimatedTotalUsd}` : '# Prix non disponibles',
    '',
  ];
  for (const item of list.items) {
    const set =
      item.entry.setCode != null
        ? ` (${item.entry.setCode.toUpperCase()})${item.entry.collectorNumber ? ` ${item.entry.collectorNumber}` : ''}`
        : '';
    const price =
      item.totalPriceUsd != null ? ` — ~$${item.totalPriceUsd}` : '';
    lines.push(`${item.missingQty} ${item.entry.name}${set}${price}`);
  }
  return lines.join('\n') + '\n';
}

export function exportShoppingListCsv(list: ShoppingList): string {
  const header = 'quantity,name,setCode,collectorNumber,unit_usd,total_usd,scryfallId';
  const rows = list.items.map((i) =>
    [
      i.missingQty,
      csvEscape(i.entry.name),
      i.entry.setCode || '',
      i.entry.collectorNumber || '',
      i.unitPriceUsd ?? '',
      i.totalPriceUsd ?? '',
      i.entry.scryfallId || '',
    ].join(',')
  );
  return [header, ...rows].join('\n') + '\n';
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
