import { playDropAt } from '../playDrop';

describe('playDropAt', () => {
  const originalFromPoint = document.elementsFromPoint;

  afterEach(() => {
    document.body.replaceChildren();
    document.elementsFromPoint = originalFromPoint;
  });

  it('drops a commander onto the playmat under the command pile', () => {
    const mat = document.createElement('div');
    mat.dataset.playDrop = 'battlefield';
    mat.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        toJSON() {},
      }) as DOMRect;
    const pile = document.createElement('div');
    pile.dataset.playDrop = 'command';
    document.body.append(mat, pile);
    document.elementsFromPoint = () => [pile, mat];

    expect(playDropAt(100, 80)?.zone).toBe('command');
    expect(playDropAt(100, 80, [], 'command')).toEqual({
      zone: 'battlefield',
      x: 50,
      y: 40,
      cardId: undefined,
      boardUserId: undefined,
    });
  });
});
