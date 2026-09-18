import { useEffect, useRef, useState } from 'react';
import { rtcLinkLabel, rtcLinkRingClass, type RtcLinkStatus } from '../../utils/rtcLinkStatus';
import { VideoTile } from './VideoTile';

interface RtcControlsProps {
  camOn: boolean;
  micOn: boolean;
  linkStatus?: RtcLinkStatus;
  onToggleCam: () => void;
  onToggleMic: () => void;
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
  cameraId: string;
  micId: string;
  onCameraChange: (deviceId: string) => void;
  onMicChange: (deviceId: string) => void;
  noiseGate: number;
  onNoiseGateChange: (value: number) => void;
  onEnableMedia?: () => void;
  previewStream?: MediaStream | null;
  error?: string | null;
  disabled?: boolean;
}

function deviceLabel(device: MediaDeviceInfo, index: number, kind: 'cam' | 'mic'): string {
  if (device.label) return device.label;
  return kind === 'cam' ? `Caméra ${index + 1}` : `Micro ${index + 1}`;
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

    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
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
  camOn,
  micOn,
  linkStatus = 'idle',
  onToggleCam,
  onToggleMic,
  cameras,
  mics,
  cameraId,
  micId,
  onCameraChange,
  onMicChange,
  noiseGate,
  onNoiseGateChange,
  onEnableMedia,
  previewStream,
  error,
  disabled,
}: RtcControlsProps) {
  const [open, setOpen] = useState(false);
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

  const selectClass =
    'w-full rounded-lg bg-black/40 border border-white/15 text-xs text-white px-2 py-1.5 outline-none focus:ring-1 focus:ring-sky-400';
  const ring = rtcLinkRingClass(linkStatus);
  const linkHint = rtcLinkLabel(linkStatus);

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5">
      <span className="sr-only" aria-live="polite">
        {linkHint}
      </span>
      <button
        type="button"
        onClick={onToggleMic}
        disabled={disabled}
        title={`${micOn ? 'Couper le micro' : 'Activer le micro'} — ${linkHint}`}
        aria-label={`${micOn ? 'Couper le micro' : 'Activer le micro'}. ${linkHint}`}
        className={`h-9 w-9 rounded-full flex items-center justify-center text-sm disabled:opacity-50 ${ring} ${
          micOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-600 hover:bg-red-500'
        }`}
      >
        {micOn ? '🎤' : '🔇'}
      </button>
      <button
        type="button"
        onClick={onToggleCam}
        disabled={disabled}
        title={`${camOn ? 'Couper la caméra' : 'Activer la caméra'} — ${linkHint}`}
        aria-label={`${camOn ? 'Couper la caméra' : 'Activer la caméra'}. ${linkHint}`}
        className={`h-9 w-9 rounded-full flex items-center justify-center text-sm disabled:opacity-50 ${ring} ${
          camOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-600 hover:bg-red-500'
        }`}
      >
        {camOn ? '📷' : '🚫'}
      </button>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        title={`Choisir caméra et micro — ${linkHint}`}
        className={`h-9 w-9 rounded-full flex items-center justify-center text-sm disabled:opacity-50 ${ring} ${
          open ? 'bg-sky-600 hover:bg-sky-500' : error ? 'bg-red-600 hover:bg-red-500' : 'bg-white/10 hover:bg-white/20'
        }`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        ⚙
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Sources audio et vidéo"
          className="absolute right-0 top-full mt-2 z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-white/15 bg-[#0c1b24] shadow-xl p-3 space-y-3"
        >
          <p className="text-xs font-semibold text-white/80">Sources</p>
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
          {previewStream && previewStream.getTracks().length > 0 && (
            <VideoTile stream={previewStream} muted label="Aperçu" compact={false} />
          )}
          <label className="block space-y-1">
            <span className="text-[11px] text-white/60">Caméra</span>
            <select
              className={selectClass}
              value={cameraId}
              onChange={(event) => onCameraChange(event.target.value)}
            >
              <option value="">Caméra par défaut</option>
              {cameras.map((device, index) => (
                <option key={device.deviceId || `cam-${index}`} value={device.deviceId}>
                  {deviceLabel(device, index, 'cam')}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-white/60">Micro</span>
            <select
              className={selectClass}
              value={micId}
              onChange={(event) => onMicChange(event.target.value)}
            >
              <option value="">Micro par défaut</option>
              {mics.map((device, index) => (
                <option key={device.deviceId || `mic-${index}`} value={device.deviceId}>
                  {deviceLabel(device, index, 'mic')}
                </option>
              ))}
            </select>
          </label>
          <MicLevelMeter stream={previewStream} micOn={micOn} />
          <label className="block space-y-1">
            <span className="flex items-center justify-between gap-2 text-[11px] text-white/60">
              <span>Réduction du bruit</span>
              <span className="tabular-nums text-white/80">{noiseGate}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={noiseGate}
              disabled={disabled}
              onChange={(event) => onNoiseGateChange(Number(event.target.value))}
              className="w-full accent-emerald-400"
              aria-label="Réduction du bruit du micro"
            />
            <span className="flex justify-between text-[10px] text-white/40">
              <span>Aucun</span>
              <span>Max</span>
            </span>
            <p className="text-[11px] text-white/50 leading-snug">
              {noiseGate <= 0
                ? 'Le micro est envoyé tel quel, ambiance comprise.'
                : 'Le fond sonore sous le seuil est coupé. Parlez pour vérifier que la voix passe.'}
            </p>
          </label>
          {onEnableMedia && (
            <button
              type="button"
              onClick={onEnableMedia}
              className="w-full text-xs rounded-lg bg-sky-600 hover:bg-sky-500 px-3 py-2"
            >
              Autoriser caméra et micro
            </button>
          )}
          {error && <p className="text-[11px] text-red-300 leading-snug">{error}</p>}
          {cameras.length === 0 && mics.length === 0 && !error && (
            <p className="text-[11px] text-white/50 leading-snug">
              Autorisez l’accès pour lister les périphériques, puis choisissez la caméra et le micro.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
