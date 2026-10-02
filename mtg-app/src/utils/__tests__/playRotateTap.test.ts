import { angleBetween, shouldTapFromRotate, shortestAngleDelta, TAP_ROTATE_RAD } from '../playRotateTap';

describe('playRotateTap', () => {
  it('measures the angle between two fingers', () => {
    expect(angleBetween({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0);
    expect(angleBetween({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2);
  });

  it('taps after a quarter-turn and ignores a small twist', () => {
    expect(shouldTapFromRotate(0, TAP_ROTATE_RAD)).toBe(true);
    expect(shouldTapFromRotate(0, Math.PI / 2)).toBe(true);
    expect(shouldTapFromRotate(0, 0.1)).toBe(false);
    expect(shortestAngleDelta(-Math.PI * 0.9, Math.PI * 0.9)).toBeCloseTo(-0.2 * Math.PI, 5);
  });
});
