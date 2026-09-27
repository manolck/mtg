import { formatBytes, formatUptime } from '../../utils/monitorFormat';

describe('monitorFormat', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats uptime', () => {
    expect(formatUptime(90)).toBe('1m');
    expect(formatUptime(3700)).toBe('1h 1m');
    expect(formatUptime(90000)).toBe('1j 1h');
  });
});
