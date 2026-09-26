/** Stable accent colors for play seats (hand choices, etc.). */

const SEAT_COLORS = [
  '#38bdf8', // sky
  '#f472b6', // pink
  '#a3e635', // lime
  '#fb923c', // orange
  '#c084fc', // purple
  '#2dd4bf', // teal
  '#facc15', // yellow
  '#f87171', // red
] as const;

export function playSeatColor(seatIndex: number): string {
  const i = Number.isFinite(seatIndex) ? Math.abs(Math.trunc(seatIndex)) : 0;
  return SEAT_COLORS[i % SEAT_COLORS.length];
}

export function playUserColor(
  userId: string,
  players: Array<{ userId: string; seatIndex: number }>,
): string {
  const seat = players.find((player) => player.userId === userId)?.seatIndex;
  if (seat == null) {
    let hash = 0;
    for (let i = 0; i < userId.length; i += 1) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
    return SEAT_COLORS[Math.abs(hash) % SEAT_COLORS.length];
  }
  return playSeatColor(seat);
}
