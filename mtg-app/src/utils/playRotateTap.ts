export const TAP_ROTATE_RAD = Math.PI / 6;

export function angleBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function shortestAngleDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
}

export function shouldTapFromRotate(startAngle: number, currentAngle: number): boolean {
  return Math.abs(shortestAngleDelta(startAngle, currentAngle)) >= TAP_ROTATE_RAD;
}
