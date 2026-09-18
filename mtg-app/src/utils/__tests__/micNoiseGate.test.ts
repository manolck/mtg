import { nextNoiseGateOpen, shouldSendMic } from '../micNoiseGate';

describe('micNoiseGate', () => {
  it('stays open when the gate is off', () => {
    expect(nextNoiseGateOpen(0, 0, false)).toBe(true);
    expect(shouldSendMic(true, 0, false)).toBe(true);
  });

  it('opens on speech and closes on silence', () => {
    expect(nextNoiseGateOpen(0.08, 0.45, false)).toBe(true);
    expect(nextNoiseGateOpen(0, 0.45, true)).toBe(false);
    expect(nextNoiseGateOpen(0.03, 0.45, true)).toBe(true);
  });

  it('never sends while the user muted the mic', () => {
    expect(shouldSendMic(false, 0, true)).toBe(false);
    expect(shouldSendMic(false, 0.45, true)).toBe(false);
    expect(shouldSendMic(true, 0.45, false)).toBe(false);
    expect(shouldSendMic(true, 0.45, true)).toBe(true);
  });
});
