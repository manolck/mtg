import { playMicConstraintAttempts } from '../playMicConstraints';

describe('playMicConstraintAttempts', () => {
  it('asks for the exact selected device before any processing fallback', () => {
    expect(playMicConstraintAttempts('mic-2')[0]).toEqual({
      audio: { deviceId: { exact: 'mic-2' } },
      video: false,
    });
  });

  it('does not fall back to the default mic when a specific device is required', () => {
    const attempts = playMicConstraintAttempts('mic-2', { strictDevice: true });
    expect(attempts).toHaveLength(2);
    expect(attempts.every((item) => JSON.stringify(item).includes('mic-2'))).toBe(true);
  });
});
