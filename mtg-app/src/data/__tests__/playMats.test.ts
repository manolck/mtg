import { BUILTIN_PLAY_MATS, commanderPlayMat, isValidPlaymatId, resolvePlayMat } from '../playMats';

describe('playMats', () => {
  it('accepts catalog ids and rejects path tricks', () => {
    expect(isValidPlaymatId('canopy')).toBe(true);
    expect(isValidPlaymatId('coast-2')).toBe(true);
    expect(isValidPlaymatId('Druide_maléfique')).toBe(true);
    expect(isValidPlaymatId('commander')).toBe(true);
    expect(isValidPlaymatId('../secret')).toBe(false);
    expect(isValidPlaymatId('foo/bar')).toBe(false);
    expect(isValidPlaymatId('')).toBe(false);
  });

  it('falls back to the default css mat', () => {
    expect(resolvePlayMat(undefined, []).id).toBe(BUILTIN_PLAY_MATS[0].id);
    expect(resolvePlayMat('missing', []).kind).toBe('css');
  });

  it('uses commander art as the default mat when no other mat is chosen', () => {
    const commander = commanderPlayMat(
      'https://cards.scryfall.io/normal/front/k/a/kaalia.jpg',
      'Kaalia of the Vast',
    );
    expect(commander?.id).toBe('commander');
    expect(commander?.kind).toBe('image');
    expect(commander?.imageUrl).toContain('/art_crop/');
    expect(resolvePlayMat(undefined, [], commander).id).toBe('commander');
    expect(resolvePlayMat('commander', [], commander).imageUrl).toContain('/art_crop/');
    expect(resolvePlayMat('battlefield', [], commander).id).toBe('battlefield');
  });
});
