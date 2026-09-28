import { BUILTIN_PLAY_MATS, isValidPlaymatId, resolvePlayMat } from '../playMats';

describe('playMats', () => {
  it('accepts catalog ids and rejects path tricks', () => {
    expect(isValidPlaymatId('canopy')).toBe(true);
    expect(isValidPlaymatId('coast-2')).toBe(true);
    expect(isValidPlaymatId('../secret')).toBe(false);
    expect(isValidPlaymatId('foo/bar')).toBe(false);
    expect(isValidPlaymatId('')).toBe(false);
  });

  it('falls back to the default css mat', () => {
    expect(resolvePlayMat(undefined, []).id).toBe(BUILTIN_PLAY_MATS[0].id);
    expect(resolvePlayMat('missing', []).kind).toBe('css');
  });
});
