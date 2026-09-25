import {
  EMPTY_AUDIO_STATS,
  formatAudioStats,
  isOutboundAudioBlocked,
  sumAudioRtcStats,
} from '../rtcAudioStats';

describe('sumAudioRtcStats', () => {
  it('adds outbound and inbound audio packets across peers', () => {
    expect(
      sumAudioRtcStats([
        { type: 'outbound-rtp', kind: 'audio', packetsSent: 12 },
        { type: 'inbound-rtp', kind: 'audio', packetsReceived: 40, packetsLost: 1 },
        { type: 'outbound-rtp', kind: 'video', packetsSent: 999 },
      ]),
    ).toEqual({ packetsSent: 12, packetsReceived: 40, packetsLost: 1 });
  });

  it('starts empty', () => {
    expect(sumAudioRtcStats([])).toEqual(EMPTY_AUDIO_STATS);
  });
});

describe('formatAudioStats', () => {
  it('shows sent and received counts', () => {
    expect(formatAudioStats({ packetsSent: 8, packetsReceived: 21, packetsLost: 0 })).toBe(
      'Envoyés 8 · Reçus 21',
    );
  });
});

describe('isOutboundAudioBlocked', () => {
  it('detects receive-only audio path', () => {
    expect(isOutboundAudioBlocked({ packetsSent: 0, packetsReceived: 40, packetsLost: 0 })).toBe(
      true,
    );
    expect(isOutboundAudioBlocked({ packetsSent: 1, packetsReceived: 40, packetsLost: 0 })).toBe(
      false,
    );
    expect(isOutboundAudioBlocked(EMPTY_AUDIO_STATS)).toBe(false);
  });
});
