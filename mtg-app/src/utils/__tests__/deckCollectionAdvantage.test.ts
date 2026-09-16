import { buildShoppingListRows, exportShoppingListCsv, exportShoppingListText } from '../deckShoppingList';
import { findOwnedPrintAlternatives, findSwappableEntries } from '../deckPrintSwap';
import type { OwnershipRow } from '../../hooks/useDeckOwnership';
import type { UserCard } from '../../types/card';
import type { DeckEntry } from '../../types/deck';

jest.mock('../../services/mtgjsonPriceServiceAPI', () => ({
  getCardPriceFromMTGJSON: jest.fn().mockResolvedValue({ usd: '1.50' }),
}));

describe('deckShoppingList', () => {
  const missing: OwnershipRow[] = [
    {
      entry: {
        scryfallId: 'sf-1',
        name: 'Lightning Bolt',
        setCode: 'm21',
        collectorNumber: '161',
        quantity: 4,
      },
      neededQty: 4,
      ownedQty: 1,
      missingQty: 3,
    },
  ];

  it('builds rows from missing', () => {
    const rows = buildShoppingListRows(missing);
    expect(rows).toHaveLength(1);
    expect(rows[0].missingQty).toBe(3);
  });

  it('exports text and csv', () => {
    const list = {
      items: [
        {
          entry: missing[0].entry,
          missingQty: 3,
          unitPriceUsd: 1.5,
          totalPriceUsd: 4.5,
        },
      ],
      totalMissing: 3,
      estimatedTotalUsd: 4.5,
      pricedCount: 1,
    };
    const text = exportShoppingListText(list, 'Burn');
    expect(text).toContain('3 Lightning Bolt');
    expect(text).toContain('~$4.5');
    const csv = exportShoppingListCsv(list);
    expect(csv).toContain('quantity,name');
    expect(csv).toContain('Lightning Bolt');
  });
});

describe('deckPrintSwap', () => {
  const deckEntry: DeckEntry = {
    scryfallId: 'print-a',
    name: 'Lightning Bolt',
    setCode: 'lea',
    collectorNumber: '161',
    quantity: 4,
  };

  const collection: UserCard[] = [
    {
      id: 'c1',
      name: 'Lightning Bolt',
      quantity: 2,
      userId: 'u1',
      createdAt: new Date(),
      setCode: 'lea',
      collectorNumber: '161',
      mtgData: { id: 'print-a', name: 'Lightning Bolt', set: 'lea', number: '161' },
    },
    {
      id: 'c2',
      name: 'Lightning Bolt',
      quantity: 4,
      userId: 'u1',
      createdAt: new Date(),
      setCode: 'm21',
      collectorNumber: '161',
      mtgData: { id: 'print-b', name: 'Lightning Bolt', set: 'm21', number: '161', imageUrl: 'http://x' },
    },
  ];

  it('finds alternate printings', () => {
    const alts = findOwnedPrintAlternatives(deckEntry, collection);
    expect(alts.length).toBe(2);
    expect(alts.some((a) => a.isCurrentPrint)).toBe(true);
    expect(alts.some((a) => a.entry.scryfallId === 'print-b')).toBe(true);
  });

  it('marks swappable entries', () => {
    const swappable = findSwappableEntries([deckEntry], collection);
    expect(swappable).toHaveLength(1);
  });
});
