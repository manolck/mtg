export interface RtcAudioStats {
  packetsSent: number;
  packetsReceived: number;
  packetsLost: number;
  /** e.g. `relay → srflx (udp)` when a nominated ICE pair exists. */
  icePath?: string;
  usingRelay?: boolean;
  /** ICE is restarting with `iceTransportPolicy: 'relay'`. */
  forcingRelay?: boolean;
  /** Last TURN allocation error (no credentials). */
  turnError?: string;
}

export const EMPTY_AUDIO_STATS: RtcAudioStats = {
  packetsSent: 0,
  packetsReceived: 0,
  packetsLost: 0,
};

type AudioStatRow = {
  type: string;
  kind?: string;
  packetsSent?: number;
  packetsReceived?: number;
  packetsLost?: number;
};

export type IceStatRow = {
  id?: string;
  type: string;
  state?: string;
  nominated?: boolean;
  selected?: boolean;
  localCandidateId?: string;
  remoteCandidateId?: string;
  selectedCandidatePairId?: string;
  candidateType?: string;
  protocol?: string;
  address?: string;
  url?: string;
};

function candidateLabel(row?: IceStatRow): string {
  if (!row?.candidateType) return '?';
  return row.candidateType;
}

export function summarizeIcePath(rows: Iterable<IceStatRow>): Pick<RtcAudioStats, 'icePath' | 'usingRelay'> {
  const byId = new Map<string, IceStatRow>();
  const pairs: IceStatRow[] = [];
  let selectedPairId: string | undefined;
  for (const row of rows) {
    if (row.id) byId.set(row.id, row);
    if (row.type === 'candidate-pair') pairs.push(row);
    if (row.type === 'transport' && row.selectedCandidatePairId) {
      selectedPairId = row.selectedCandidatePairId;
    }
  }
  const selected =
    (selectedPairId ? pairs.find((pair) => pair.id === selectedPairId) : undefined) ||
    pairs.find((pair) => pair.nominated || pair.selected) ||
    pairs.find((pair) => pair.state === 'succeeded');
  if (!selected) return {};
  const local = selected.localCandidateId ? byId.get(selected.localCandidateId) : undefined;
  const remote = selected.remoteCandidateId ? byId.get(selected.remoteCandidateId) : undefined;
  const protocol = (local?.protocol || remote?.protocol || '').toLowerCase();
  const icePath = `${candidateLabel(local)} → ${candidateLabel(remote)}${protocol ? ` (${protocol})` : ''}`;
  const usingRelay = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
  return { icePath, usingRelay };
}

export function sumAudioRtcStats(rows: Iterable<AudioStatRow>): RtcAudioStats {
  const next = { ...EMPTY_AUDIO_STATS };
  for (const row of rows) {
    if (row.kind && row.kind !== 'audio') continue;
    if (row.type === 'outbound-rtp') {
      next.packetsSent += row.packetsSent || 0;
    }
    if (row.type === 'inbound-rtp') {
      next.packetsReceived += row.packetsReceived || 0;
      next.packetsLost += row.packetsLost || 0;
    }
  }
  return next;
}

export function formatAudioStats(stats: RtcAudioStats): string {
  return `Envoyés ${stats.packetsSent} · Reçus ${stats.packetsReceived}${
    stats.packetsLost ? ` · Perdus ${stats.packetsLost}` : ''
  }`;
}

/** True when we hear the peer but our mic packets never leave (typical hard-NAT without TURN). */
export function isOutboundAudioBlocked(
  stats: Pick<RtcAudioStats, 'packetsSent' | 'packetsReceived'>,
): boolean {
  return stats.packetsReceived > 0 && stats.packetsSent === 0;
}
