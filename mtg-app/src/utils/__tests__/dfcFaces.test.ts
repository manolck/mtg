import { extractDfcBack, isDfcLayout } from '../dfcFaces';

describe('dfcFaces', () => {
  it('extracts the printed back of a transform card', () => {
    expect(isDfcLayout('transform')).toBe(true);
    expect(isDfcLayout('split')).toBe(false);
    const back = extractDfcBack({
      layout: 'modal_dfc',
      card_faces: [
        { name: 'Front', image_uris: { normal: 'https://front.jpg' } },
        { name: 'Back', image_uris: { normal: 'https://back.jpg' } },
      ],
    });
    expect(back).toEqual({ backImageUrl: 'https://back.jpg', backName: 'Back' });
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
