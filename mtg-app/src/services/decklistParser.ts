import type { DeckEntry, DeckZone } from '../types/deck';

export interface ParsedDeckLine {
  quantity: number;
  name: string;
  setCode?: string;
  collectorNumber?: string;
  zone: DeckZone;
}

const ZONE_HEADERS: Record<string, DeckZone> = {
  deck: 'mainboard',
  main: 'mainboard',
  mainboard: 'mainboard',
  maindeck: 'mainboard',
  side: 'sideboard',
  sideboard: 'sideboard',
  maybe: 'maybeboard',
  maybeboard: 'maybeboard',
  commander: 'commanders',
  commanders: 'commanders',
  'commander(s)': 'commanders',
};

/**
 * Parse a Moxfield / Arena / MTGO style decklist.
 * Examples:
 *   4 Lightning Bolt
 *   1x Sol Ring (C21) 7
 *   1 Atraxa, Praetors' Voice
 */
export function parseDecklistText(text: string): ParsedDeckLine[] {
  const lines = text.split(/\r?\n/);
  let zone: DeckZone = 'mainboard';
  const result: ParsedDeckLine[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;

    const headerKey = line.toLowerCase().replace(/:$/, '');
    if (ZONE_HEADERS[headerKey]) {
      zone = ZONE_HEADERS[headerKey];
      continue;
    }

    // SIDEBOARD / COMMANDER section markers used by Arena
    if (/^sideboard$/i.test(line) || /^sideboard:/i.test(line)) {
      zone = 'sideboard';
      continue;
    }
    if (/^commander$/i.test(line) || /^commander:/i.test(line)) {
      zone = 'commanders';
      continue;
    }

    // 4 Lightning Bolt | 1x Sol Ring (C21) 7 | 1 Sol Ring [C21] 7
    const m = line.match(
      /^(\d+)\s*x?\s+(.+?)(?:\s+\(([A-Za-z0-9]+)\)\s*(\S+)?)?(?:\s+\[([A-Za-z0-9]+)\]\s*(\S+)?)?\s*$/
    );
    if (!m) continue;

    const quantity = parseInt(m[1], 10);
    let name = m[2].trim();
    // Strip trailing set codes glued without parens sometimes
    name = name.replace(/\s+$/, '');
    const setCode = (m[3] || m[5] || undefined)?.toLowerCase();
    const collectorNumber = m[4] || m[6] || undefined;

    if (!quantity || !name) continue;

    result.push({
      quantity,
      name,
      setCode,
      collectorNumber,
      zone: zone === 'commanders' ? 'commanders' : zone,
    });
  }

  return result;
}

export function exportDecklistText(params: {
  mainboard: DeckEntry[];
  sideboard?: DeckEntry[];
  maybeboard?: DeckEntry[];
  commanders?: DeckEntry[];
}): string {
  const lines: string[] = [];
  const writeZone = (title: string, entries: DeckEntry[]) => {
    if (!entries.length) return;
    lines.push(title);
    for (const e of entries) {
      const setPart = e.setCode ? ` (${e.setCode.toUpperCase()}) ${e.collectorNumber || ''}`.trimEnd() : '';
      lines.push(`${e.quantity} ${e.name}${setPart}`);
    }
    lines.push('');
  };

  if (params.commanders?.length) writeZone('Commander', params.commanders);
  writeZone('Deck', params.mainboard);
  if (params.sideboard?.length) writeZone('Sideboard', params.sideboard);
  if (params.maybeboard?.length) writeZone('Maybeboard', params.maybeboard);
  return lines.join('\n').trim() + '\n';
}
