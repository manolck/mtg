import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../UI/Button';
import {
  fetchMagicCorpStatus,
  formatBytes,
  isMonitorConfigured,
  streamMagicCorpUpdate,
  type MagicCorpStatus,
} from '../../services/monitorService';
import { invalidateMagicCorporationCache } from '../../services/magicCorporationService';

const MAX_LOG_LINES = 80;

export function AdminMagicCorpPanel() {
  const configured = isMonitorConfigured();
  const [status, setStatus] = useState<MagicCorpStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [percent, setPercent] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const stopRef = useRef<(() => void) | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!configured) return;
    try {
      const next = await fetchMagicCorpStatus();
      setStatus(next);
      setStatusError(null);
      if (next.running && !running) {
        setRunning(true);
        setProgressMsg('Mise à jour déjà en cours sur le serveur…');
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Erreur statut');
    }
  }, [configured, running]);

  useEffect(() => {
    if (!configured) return;
    void refreshStatus();
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [configured, refreshStatus]);

  useEffect(() => {
    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, []);

  const startUpdate = () => {
    if (!configured || running) return;
    setRunning(true);
    setError(null);
    setDoneMsg(null);
    setPercent(0);
    setProgressMsg('Connexion…');
    setLogs([]);

    stopRef.current?.();
    stopRef.current = streamMagicCorpUpdate((event) => {
      if (event.type === 'progress') {
        setPercent(event.percent);
        if (event.message) setProgressMsg(event.message);
      } else if (event.type === 'log' && event.message) {
        setLogs((prev) => {
          const next = [...prev, event.message];
          return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
        });
      } else if (event.type === 'done') {
        setPercent(100);
        setDoneMsg(
          event.ok
            ? `OK — ${event.cards ?? 0} cartes` +
                (event.uniqueCards != null ? ` (${event.uniqueCards} noms VO uniques)` : '') +
                (event.pageErrors ? `, ${event.pageErrors} page(s) en erreur` : '')
            : 'Terminé avec un statut inattendu.',
        );
        invalidateMagicCorporationCache();
        setRunning(false);
        void refreshStatus();
      } else if (event.type === 'error') {
        setError(event.message);
        setRunning(false);
        void refreshStatus();
      } else if (event.type === 'meta' && event.closed) {
        setRunning(false);
        void refreshStatus();
      }
    });
  };

  if (!configured) {
    return (
      <div className="surface-card p-4 space-y-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">MagicCorporation</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Configurez <code className="text-xs">VITE_MONITOR_URL</code> pour mettre à jour{' '}
          <code className="text-xs">magiccorporation-cards.json</code> depuis l’admin (même service que le monitoring).
        </p>
      </div>
    );
  }

  return (
    <div className="surface-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">MagicCorporation</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Fichier de correspondance FR/EN servi à la racine du site. La table de jeu ne le télécharge plus
            automatiquement ; la collection / recherche l’utilise s’il est présent.
          </p>
        </div>
        <Button onClick={startUpdate} loading={running} disabled={running || Boolean(status?.running)}>
          {running || status?.running ? 'Mise à jour…' : 'Mettre à jour le fichier'}
        </Button>
      </div>

      {statusError && (
        <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
          {statusError}
        </p>
      )}

      {status && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Fichier</dt>
            <dd className="font-mono text-xs break-all text-gray-900 dark:text-gray-100">{status.path}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">État</dt>
            <dd className="text-gray-900 dark:text-gray-100">
              {status.exists
                ? `Présent — ${formatBytes(status.sizeBytes)}${status.mtime ? ` · ${new Date(status.mtime).toLocaleString()}` : ''}`
                : 'Absent (404 côté site)'}
              {status.running ? ' · job en cours' : ''}
            </dd>
          </div>
        </dl>
      )}

      {(running || percent > 0) && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-800 dark:text-gray-100">{progressMsg || 'Progression'}</span>
            <span className="text-gray-600 dark:text-gray-300">{Math.round(percent)}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${error ? 'bg-red-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
          {error}
        </p>
      )}
      {doneMsg && (
        <p className="text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded p-2">
          {doneMsg}
        </p>
      )}

      {logs.length > 0 && (
        <pre className="max-h-40 overflow-auto rounded bg-gray-950 text-gray-100 text-xs p-3 whitespace-pre-wrap">
          {logs.join('\n')}
        </pre>
      )}
    </div>
  );
}
