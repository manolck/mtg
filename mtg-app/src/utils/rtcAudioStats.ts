export interface RtcAudioStats {
  packetsSent: number;
  packetsReceived: number;
  packetsLost: number;
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
