/**
 * Admin machine monitor (stats + live journal logs).
 * Configure VITE_MONITOR_URL at build time (e.g. https://host/monitor).
 * Auth = PocketBase admin session — never a VITE_* secret.
 */

import { pb } from './pocketbase';

const MONITOR_URL = (import.meta.env.VITE_MONITOR_URL as string | undefined)?.trim().replace(/\/$/, '');

export function isMonitorConfigured(): boolean {
  return Boolean(MONITOR_URL);
}

export function getMonitorBaseUrl(): string {
  return MONITOR_URL || '';
}

export interface MonitorServiceStatus {
  unit: string;
  active: string;
}

export interface MonitorProbe {
  ok: boolean;
  status: number;
  ms: number;
  error?: string;
}

export interface MonitorStats {
  ok: boolean;
  at: string;
  host: {
    hostname: string;
    platform: string;
    uptimeSec: number;
    cpus: number;
  };
  cpu: {
    load1: number;
    load5: number;
    load15: number;
    loadPerCpu: number;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    usedPercent: number;
  };
  temperatureC: number | null;
  disk: {
    path: string;
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    usedPercent: number;
  } | null;
  services: MonitorServiceStatus[];
  health: {
    playSync: MonitorProbe;
    pocketBase: MonitorProbe;
  };
}

function authHeaders(): HeadersInit {
  const token = pb.authStore.token;
  if (!token) throw new Error('Session expirée. Reconnectez-vous.');
  return { 'X-PocketBase-Auth': token };
}

export async function fetchMonitorStats(): Promise<MonitorStats> {
  if (!MONITOR_URL) throw new Error('Monitoring non configuré (VITE_MONITOR_URL).');
  const res = await fetch(`${MONITOR_URL}/stats`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(12_000),
  });
  const data = (await res.json().catch(() => ({}))) as MonitorStats & { message?: string };
  if (!res.ok) {
    throw new Error(data.message || `Erreur serveur ${res.status}`);
  }
  return data;
}

export type MonitorLogEvent =
  | { type: 'meta'; units?: string[]; at?: string; closed?: boolean; code?: number | null }
  | { type: 'log'; line: string; at?: string }
  | { type: 'error'; message: string };

/**
 * Stream journalctl lines via SSE (fetch + ReadableStream so auth headers work).
 * Returns an abort function.
 */
export function streamMonitorLogs(
  onEvent: (event: MonitorLogEvent) => void,
  options?: { units?: string[] },
): () => void {
  if (!MONITOR_URL) {
    onEvent({ type: 'error', message: 'Monitoring non configuré (VITE_MONITOR_URL).' });
    return () => {};
  }

  const controller = new AbortController();
  const params = options?.units?.length ? `?units=${encodeURIComponent(options.units.join(','))}` : '';
  const url = `${MONITOR_URL}/logs${params}`;

  void (async () => {
    try {
      const res = await fetch(url, {
        headers: {
          ...authHeaders(),
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        let message = `Erreur serveur ${res.status}`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          /* ignore */
        }
        onEvent({ type: 'error', message });
        return;
      }
      if (!res.body) {
        onEvent({ type: 'error', message: 'Flux de logs indisponible.' });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';
        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          let event = 'message';
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }
          if (!dataLines.length) continue;
          try {
            const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
            if (event === 'log') {
              onEvent({ type: 'log', line: String(data.line || ''), at: data.at as string | undefined });
            } else if (event === 'error') {
              onEvent({ type: 'error', message: String(data.message || 'erreur') });
            } else if (event === 'meta') {
              onEvent({
                type: 'meta',
                units: data.units as string[] | undefined,
                at: data.at as string | undefined,
                closed: data.closed as boolean | undefined,
                code: data.code as number | null | undefined,
              });
            }
          } catch {
            /* ignore malformed */
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      onEvent({
        type: 'error',
        message: err instanceof Error ? err.message : 'Connexion logs interrompue.',
      });
    }
  })();

  return () => controller.abort();
}

import { formatBytes, formatUptime } from '../utils/monitorFormat';

export { formatBytes, formatUptime };
