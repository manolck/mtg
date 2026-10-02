import {
  forgetLocalGdprConsent,
  hasLocalGdprConsent,
  isNotFoundError,
  rememberLocalGdprConsent,
} from '../gdprConsentStorage';

describe('gdprConsentStorage', () => {
  const uid = 'user-1';

  beforeEach(() => {
    localStorage.clear();
  });

  it('remembers consent so a later API error does not look like a missing accept', () => {
    expect(hasLocalGdprConsent(uid)).toBe(false);
    rememberLocalGdprConsent(uid);
    expect(hasLocalGdprConsent(uid)).toBe(true);
    forgetLocalGdprConsent(uid);
    expect(hasLocalGdprConsent(uid)).toBe(false);
  });

  it('treats only 404 as missing consent', () => {
    expect(isNotFoundError({ status: 404 })).toBe(true);
    expect(isNotFoundError({ response: { code: 404 } })).toBe(true);
    expect(isNotFoundError({ status: 400 })).toBe(false);
    expect(isNotFoundError({ status: 0 })).toBe(false);
    expect(isNotFoundError(new Error('network'))).toBe(false);
  });
});
