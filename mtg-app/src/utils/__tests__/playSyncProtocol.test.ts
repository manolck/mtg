import { resolvePlaySyncWsUrl } from '../playSyncProtocol';

describe('resolvePlaySyncWsUrl', () => {
  it('treats empty / whitespace as unset (PB fallback)', () => {
    expect(resolvePlaySyncWsUrl(undefined)).toBe('');
    expect(resolvePlaySyncWsUrl(null)).toBe('');
    expect(resolvePlaySyncWsUrl('')).toBe('');
    expect(resolvePlaySyncWsUrl('   ')).toBe('');
  });

  it('keeps a configured ws URL', () => {
    expect(resolvePlaySyncWsUrl('ws://127.0.0.1:8091/play-ws')).toBe('ws://127.0.0.1:8091/play-ws');
    expect(resolvePlaySyncWsUrl('  wss://mtg-app.duckdns.org/play-ws  ')).toBe(
      'wss://mtg-app.duckdns.org/play-ws',
    );
  });
});
