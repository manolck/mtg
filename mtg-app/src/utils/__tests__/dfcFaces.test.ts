import { extractDfcBack, isDfcLayout } from '../dfcFaces';

describe('dfcFaces', () => {
  it('extracts the printed back of a transform card', () => {
    expect(isDfcLayout('transform')).toBe(true);
    expect(isDfcLayout('split')).toBe(false);
    const back = extractDfcBack({
      layout: 'modal_dfc',
      card_faces: [
        { name: 'Front', image_uris: { normal: 'https://front.jpg' } },
        { name: 'Back', type_line: 'Land', image_uris: { normal: 'https://back.jpg' } },
      ],
    });
    expect(back).toEqual({ backImageUrl: 'https://back.jpg', backName: 'Back', backTypeLine: 'Land' });
  });

  it('prefers the printed French back name', () => {
    expect(
      extractDfcBack({
        layout: 'transform',
        card_faces: [
          { name: 'Westvale Abbey', printed_name: 'Abbaye de Valouest', image_uris: { normal: 'https://front.jpg' } },
          {
            name: 'Ormendahl, Profane Prince',
            printed_name: 'Ormendahl, Prince impie',
            type_line: 'Legendary Creature — Demon',
            image_uris: { normal: 'https://back.jpg' },
          },
        ],
      }),
    ).toEqual({
      backImageUrl: 'https://back.jpg',
      backName: 'Ormendahl, Prince impie',
      backTypeLine: 'Legendary Creature — Demon',
    });
  });

  it('ignores split cards without a second printed face', () => {
    expect(
      extractDfcBack({
        layout: 'split',
        card_faces: [{ name: 'Fire' }, { name: 'Ice' }],
      }),
    ).toBeNull();
  });
});
