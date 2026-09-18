import { scryfallPrintedName, scryfallPrintedText, scryfallPrintedType } from '../scryfallPrinted';

describe('scryfallPrinted', () => {
  it('keeps oracle fields when no printed translation exists', () => {
    expect(scryfallPrintedName({ name: 'Lightning Bolt', type_line: 'Instant' })).toBe('Lightning Bolt');
    expect(scryfallPrintedType({ name: 'Lightning Bolt', type_line: 'Instant' })).toBe('Instant');
    expect(scryfallPrintedText({ oracle_text: 'Deal 3 damage.' })).toBe('Deal 3 damage.');
  });

  it('prefers printed French fields when present', () => {
    expect(
      scryfallPrintedName({
        name: 'Lightning Bolt',
        printed_name: 'Éclair',
        type_line: 'Instant',
        printed_type_line: 'Éphémère',
      }),
    ).toBe('Éclair');
    expect(
      scryfallPrintedType({
        name: 'Lightning Bolt',
        printed_name: 'Éclair',
        type_line: 'Instant',
        printed_type_line: 'Éphémère',
      }),
    ).toBe('Éphémère');
    expect(scryfallPrintedText({ oracle_text: 'Deal 3 damage.', printed_text: 'Infligez 3 blessures.' })).toBe(
      'Infligez 3 blessures.',
    );
  });

  it('joins printed double-faced names', () => {
    expect(
      scryfallPrintedName({
        name: 'Westvale Abbey // Ormendahl, Profane Prince',
        card_faces: [
          { name: 'Westvale Abbey', printed_name: 'Abbaye de Valouest' },
          { name: 'Ormendahl, Profane Prince', printed_name: 'Ormendahl, Prince impie' },
        ],
      }),
    ).toBe('Abbaye de Valouest // Ormendahl, Prince impie');
  });
});
