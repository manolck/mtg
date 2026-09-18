import { aggregateRtcLinkStatus, rtcLinkLabel, rtcLinkRingClass } from '../rtcLinkStatus';

describe('aggregateRtcLinkStatus', () => {
  it('is idle without peers', () => {
    expect(aggregateRtcLinkStatus([])).toBe('idle');
  });

  it('is connected as soon as one peer is up', () => {
    expect(aggregateRtcLinkStatus(['connected'])).toBe('connected');
    expect(aggregateRtcLinkStatus(['connecting', 'connected'])).toBe('connected');
  });

  it('is connecting while peers are still negotiating', () => {
    expect(aggregateRtcLinkStatus(['new'])).toBe('connecting');
    expect(aggregateRtcLinkStatus(['connecting', 'new'])).toBe('connecting');
  });

  it('is disconnected when every peer dropped', () => {
    expect(aggregateRtcLinkStatus(['failed'])).toBe('disconnected');
    expect(aggregateRtcLinkStatus(['disconnected', 'closed'])).toBe('disconnected');
  });
});

describe('rtcLink chrome', () => {
  it('uses a green ring when connected and a red ring when down', () => {
    expect(rtcLinkRingClass('connected')).toContain('emerald');
    expect(rtcLinkRingClass('disconnected')).toContain('red');
    expect(rtcLinkLabel('connected')).toMatch(/établie/i);
    expect(rtcLinkLabel('disconnected')).toMatch(/hors connexion/i);
  });
});
