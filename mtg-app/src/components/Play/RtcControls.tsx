import { useEffect, useRef, useState } from 'react';
import { rtcLinkLabel, rtcLinkRingClass, type RtcLinkStatus } from '../../utils/rtcLinkStatus';
import {
  EMPTY_AUDIO_STATS,
  formatAudioStats,
  type RtcAudioStats,
} from '../../utils/rtcAudioStats';

interface RtcControlsProps {
  micOn: boolean;
  linkStatus?: RtcLinkStatus;
  onToggleMic: () => void;
  mics: MediaDeviceInfo[];
  micId: string;
  onMicChange: (deviceId: string) => void;
  onEnableMedia?: () => void;
  previewStream?: MediaStream | null;
  getAudioStats?: () => Promise<RtcAudioStats>;
  error?: string | null;
  disabled?: boolean;
  hearBlocked?: boolean;
  onUnlockHear?: () => void;
}

function deviceLabel(device: MediaDeviceInfo, index: number): string {
  if (device.label) return device.label;
  return `Micro ${index + 1}`;
}

function MicLevelMeter({ stream, micOn }: { stream?: MediaStream | null; micOn: boolean }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'missing' | 'muted' | 'silent' | 'live'>('missing');

  useEffect(() => {
    const track = stream?.getAudioTracks().find((item) => item.readyState === 'live');
    if (!track) {
      setStatus('missing');
      if (fillRef.current) fillRef.current.style.transform = 'scaleX(0)';
      return;
    }
    if (!micOn || !track.enabled) {
      setStatus('muted');
      if (fillRef.current) fillRef.current.style.transform = 'scaleX(0)';
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      setStatus('missing');
      return;
    }

    const probe = track.clone();
    probe.enabled = true;
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(new MediaStream([probe]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.65;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let raf = 0;
    let stopped = false;
    let speakingUntil = 0;
    let lastStatus: 'silent' | 'live' = 'silent';

    const tick = () => {
      if (stopped) return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const value = (samples[i] - 128) / 128;
        sum += value * value;
      }
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 4.8);
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${level})`;
      const now = performance.now();
      if (level > 0.06) speakingUntil = now + 400;
      const nextStatus = now < speakingUntil ? 'live' : 'silent';
      if (nextStatus !== lastStatus) {
        lastStatus = nextStatus;
        setStatus(nextStatus);
      }
      raf = requestAnimationFrame(tick);
    };

    void ctx.resume().then(() => {
      if (!stopped) raf = requestAnimationFrame(tick);
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      probe.stop();
      source.disconnect();
      void ctx.close();
    };
  }, [stream, micOn]);

  const hint =
    status === 'missing'
      ? 'Aucun micro actif'
      : status === 'muted'
        ? 'Micro coupé'
        : status === 'live'
          ? 'Micro détecté'
          : 'Parlez pour vérifier le micro';

  return (
    <div className="space-y-1" aria-live="polite">
      <div
        className="h-2 rounded-full bg-white/10 overflow-hidden"
        role="meter"
        aria-label="Niveau du micro"
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          ref={fillRef}
          className="h-full w-full origin-left rounded-full bg-gradient-to-r from-emerald-400 via-lime-300 to-amber-300"
          style={{ transform: 'scaleX(0)' }}
        />
      </div>
      <p className={`text-[11px] leading-snug ${status === 'live' ? 'text-emerald-300' : 'text-white/50'}`}>
        {hint}
      </p>
    </div>
  );
}

export function RtcControls({
  micOn,
  linkStatus = 'idle',
  onToggleMic,
  mics,
  micId,
  onMicChange,
  onEnableMedia,
  previewStream,
  getAudioStats,
  error,
  disabled,
  hearBlocked,
  onUnlockHear,
}: RtcControlsProps) {
  const [open, setOpen] = useState(false);
  const [hoverMic, setHoverMic] = useState(false);
  const [stats, setStats] = useState<RtcAudioStats>(EMPTY_AUDIO_STATS);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if ((!hoverMic && !open) || !getAudioStats) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await getAudioStats();
        if (!cancelled) setStats(next);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hoverMic, open, getAudioStats]);

  const selectClass =
    'w-full rounded-lg bg-black/40 border border-white/15 text-xs text-white px-2 py-1.5 outline-none focus:ring-1 focus:ring-sky-400';
  const ring = rtcLinkRingClass(linkStatus);
  const linkHint = rtcLinkLabel(linkStatus);
  const statsHint = formatAudioStats(stats);

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5">
      <span className="sr-only" aria-live="polite">
        {linkHint}
      </span>
      <div
        className="relative"
        onMouseEnter={() => setHoverMic(true)}
        onMouseLeave={() => setHoverMic(false)}
        onFocus={() => setHoverMic(true)}
        onBlur={() => setHoverMic(false)}
      >
        <button
          type="button"
          onClick={onToggleMic}
          disabled={disabled}
          title={`${micOn ? 'Couper le micro' : 'Activer le micro'} — ${linkHint}. ${statsHint}`}
          aria-label={`${micOn ? 'Couper le micro' : 'Activer le micro'}. ${linkHint}. ${statsHint}`}
          className={`h-9 w-9 rounded-full flex items-center justify-center text-sm disabled:opacity-50 ${ring} ${
            micOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-600 hover:bg-red-500'
          }`}
        >
          {micOn ? '🎤' : '🔇'}
        </button>
        {hoverMic && (
          <div
            role="status"
            className="absolute right-0 top-full mt-2 z-50 w-52 rounded-lg border border-white/15 bg-[#0c1b24] px-2.5 py-2 text-[11px] text-white/85 shadow-xl"
          >
            <p className="font-semibold text-white/90 mb-1">{linkHint}</p>
            <p>Paquets envoyés : {stats.packetsSent}</p>
            <p>Paquets reçus : {stats.packetsReceived}</p>
            {stats.packetsLost > 0 ? <p>Paquets perdus : {stats.packetsLost}</p> : null}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        title={`Choisir le micro — ${linkHint}`}
        className={`h-9 w-9 rounded-full flex items-center justify-center text-sm disabled:opacity-50 ${ring} ${
          open ? 'bg-sky-600 hover:bg-sky-500' : error ? 'bg-red-600 hover:bg-red-500' : 'bg-white/10 hover:bg-white/20'
        }`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        ⚙
      </button>
      {hearBlocked && onUnlockHear && (
        <button
          type="button"
          onClick={onUnlockHear}
          className="h-9 px-2 rounded-lg text-[11px] font-semibold bg-amber-400 text-black hover:bg-amber-300"
        >
          Écouter
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Source audio"
          className="absolute right-0 top-full mt-2 z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-white/15 bg-[#0c1b24] shadow-xl p-3 space-y-3"
        >
          <p className="text-xs font-semibold text-white/80">Micro</p>
          <p
            className={`text-[11px] leading-snug ${
              linkStatus === 'connected'
                ? 'text-emerald-300'
                : linkStatus === 'disconnected'
                  ? 'text-red-300'
                  : linkStatus === 'connecting'
                    ? 'text-amber-300'
                    : 'text-white/50'
            }`}
          >
            {linkHint}
          </p>
          <p className="text-[11px] text-white/55 tabular-nums">{statsHint}</p>
          <label className="block space-y-1">
            <span className="text-[11px] text-white/60">Périphérique</span>
            <select
              className={selectClass}
              value={micId}
              onChange={(event) => onMicChange(event.target.value)}
            >
              <option value="">Micro par défaut</option>
              {micId && !mics.some((device) => device.deviceId === micId) ? (
                <option value={micId}>Micro actuel</option>
              ) : null}
              {mics.map((device, index) => (
                <option key={device.deviceId || `mic-${index}`} value={device.deviceId}>
                  {deviceLabel(device, index)}
                </option>
              ))}
            </select>
          </label>
          <MicLevelMeter stream={previewStream} micOn={micOn} />
          {onEnableMedia && (
            <button
              type="button"
              onClick={onEnableMedia}
              className="w-full text-xs rounded-lg bg-sky-600 hover:bg-sky-500 px-3 py-2"
            >
              Autoriser le micro
            </button>
          )}
          {error && <p className="text-[11px] text-red-300 leading-snug">{error}</p>}
          {mics.length === 0 && !error && (
            <p className="text-[11px] text-white/50 leading-snug">
              Autorisez l’accès au micro pour lister les périphériques, puis choisissez-en un.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
