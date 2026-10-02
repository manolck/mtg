import { userDisplayName } from '../userDisplayName';

describe('userDisplayName', () => {
  it('prefers the pseudonym over an email', () => {
    expect(userDisplayName({ pseudonym: 'Chris' }, 'a@b.c')).toBe('Chris');
    expect(userDisplayName({ displayName: 'Chris' }, 'a@b.c')).toBe('Chris');
  });

  it('never shows an email when no username is available', () => {
    expect(userDisplayName(null, { displayName: undefined }, 'a@b.c')).toBe('Utilisateur');
    expect(userDisplayName(undefined, 'Moi')).toBe('Moi');
  });
});
