export type RtcLinkStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export function aggregateRtcLinkStatus(
  states: Array<RTCPeerConnectionState | undefined>,
): RtcLinkStatus {
  if (states.length === 0) return 'idle';
  const values = states.map((state) => state || 'new');
  if (values.some((state) => state === 'connected')) return 'connected';
  if (values.some((state) => state === 'connecting' || state === 'new')) return 'connecting';
  return 'disconnected';
}

export function rtcLinkRingClass(status: RtcLinkStatus): string {
  switch (status) {
    case 'connected':
      return 'ring-2 ring-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]';
    case 'disconnected':
      return 'ring-2 ring-red-500 shadow-[0_0_8px_rgba(239,68,68,0.45)]';
    case 'connecting':
      return 'ring-2 ring-amber-400 animate-pulse';
    default:
      return 'ring-1 ring-white/25';
  }
}

export function rtcLinkLabel(status: RtcLinkStatus): string {
  switch (status) {
    case 'connected':
      return 'Connexion audio établie';
    case 'connecting':
      return 'Connexion audio en cours';
    case 'disconnected':
      return 'Hors connexion audio';
    default:
      return 'En attente d’un autre joueur';
  }
}
