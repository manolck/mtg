import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchMonitorStats,
  formatBytes,
  formatUptime,
  isMonitorConfigured,
  streamMonitorLogs,
  type MonitorStats,
} from '../../services/monitorService';

const STATS_MS = 2500;
const MAX_LOG_LINES = 400;

function statusTone(active: string): string {
  if (active === 'active') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  if (active === 'inactive' || active === 'failed') {
    return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
  }
  return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100';
}

function Meter({ label, percent, detail }: { label: string; percent: number; detail: string }) {
  const pct = Math.max(0, Math.min(100, percent));
  const hot = pct >= 90;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-gray-800 dark:text-gray-100">{label}</span>
        <span className="text-gray-600 dark:text-gray-300">{detail}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${hot ? 'bg-red-500' : 'bg-sky-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function AdminMonitorPanel() {
  const configured = isMonitorConfigured();
  const [stats, setStats] = useState<MonitorStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logError, setLogError] = useState<string | null>(null);
  const [logsLive, setLogsLive] = useState(false);
  const consoleRef = useRef<HTMLPreElement | null>(null);
  const stickBottomRef = useRef(true);

  const refreshStats = useCallback(async () => {
    try {
      const next = await fetchMonitorStats();
      setStats(next);
      setStatsError(null);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Erreur stats');
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    void refreshStats();
    const timer = window.setInterval(() => {
      void refreshStats();
    }, STATS_MS);
    return () => window.clearInterval(timer);
  }, [configured, refreshStats]);

  useEffect(() => {
    if (!configured || !logsLive) return;
    setLogError(null);
    const stop = streamMonitorLogs((event) => {
      if (event.type === 'log') {
        setLogLines((prev) => {
          const next = [...prev, event.line];
          return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
        });
      } else if (event.type === 'error') {
        setLogError(event.message);
      } else if (event.type === 'meta' && event.closed) {
        setLogsLive(false);
      }
    });
    return () => stop();
  }, [configured, logsLive]);

  useEffect(() => {
    if (!stickBottomRef.current || !consoleRef.current) return;
    consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [logLines]);

  if (!configured) {
    return (
      <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Monitoring serveur</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Non configuré. Définir <code className="text-xs">VITE_MONITOR_URL</code> au build (ex.{' '}
          <code className="text-xs">https://mtg-app.duckdns.org/monitor</code>) et déployer{' '}
          <code className="text-xs">scripts/monitor-server.cjs</code> — voir README.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Monitoring serveur</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {stats
              ? `${stats.host.hostname} · maj ${new Date(stats.at).toLocaleTimeString('fr-FR')}`
              : 'Chargement…'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshStats()}
          className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Rafraîchir
        </button>
      </div>

      {statsError && (
        <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-3 py-2">
          {statsError}
        </div>
      )}

      {stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Meter
              label="CPU (load 1m)"
              percent={Math.min(100, stats.cpu.loadPerCpu * 100)}
              detail={`${stats.cpu.load1.toFixed(2)} / ${stats.host.cpus} cœurs · up ${formatUptime(stats.host.uptimeSec)}`}
            />
            <Meter
              label="Mémoire"
              percent={stats.memory.usedPercent}
              detail={`${formatBytes(stats.memory.usedBytes)} / ${formatBytes(stats.memory.totalBytes)} (${stats.memory.usedPercent}%)`}
            />
            {stats.disk && (
              <Meter
                label={`Disque (${stats.disk.path})`}
                percent={stats.disk.usedPercent}
                detail={`${formatBytes(stats.disk.usedBytes)} / ${formatBytes(stats.disk.totalBytes)} (${stats.disk.usedPercent}%)`}
              />
            )}
            <div className="space-y-1">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">Température</div>
              <div className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">
                {stats.temperatureC != null ? `${stats.temperatureC.toFixed(1)} °C` : '—'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                load 5/15 : {stats.cpu.load5.toFixed(2)} / {stats.cpu.load15.toFixed(2)}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Services</h3>
            <div className="flex flex-wrap gap-2">
              {stats.services.map((svc) => (
                <span
                  key={svc.unit}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusTone(svc.active)}`}
                >
                  <span className="opacity-70">{svc.unit}</span>
                  {svc.active}
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-300">
              <span>
                play-sync health:{' '}
                {stats.health.playSync.ok
                  ? `OK (${stats.health.playSync.ms} ms)`
                  : `KO ${stats.health.playSync.status || ''} ${stats.health.playSync.error || ''}`.trim()}
              </span>
              <span>
                PocketBase health:{' '}
                {stats.health.pocketBase.ok
                  ? `OK (${stats.health.pocketBase.ms} ms)`
                  : `KO ${stats.health.pocketBase.status || ''} ${stats.health.pocketBase.error || ''}`.trim()}
              </span>
            </div>
          </div>
        </>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Console logs</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setLogLines([]);
                setLogError(null);
                setLogsLive(true);
              }}
              className="text-sm px-3 py-1.5 rounded bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50"
              disabled={logsLive}
            >
              {logsLive ? 'En direct…' : 'Démarrer le flux'}
            </button>
            <button
              type="button"
              onClick={() => setLogsLive(false)}
              className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
              disabled={!logsLive}
            >
              Stop
            </button>
            <button
              type="button"
              onClick={() => setLogLines([])}
              className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
            >
              Effacer
            </button>
          </div>
        </div>
        {logError && (
          <div className="mb-2 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
            {logError}
          </div>
        )}
        <pre
          ref={consoleRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
          className="h-64 overflow-auto rounded-md bg-slate-950 text-slate-100 text-xs font-mono p-3 leading-relaxed whitespace-pre-wrap break-all"
        >
          {logLines.length ? logLines.join('\n') : 'Aucun log — démarrer le flux (play-sync, coturn, nginx, pocketbase).'}
        </pre>
      </div>
    </div>
  );
}
