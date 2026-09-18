import { useEffect, useRef, useState } from 'react';

interface VideoTileProps {
  stream?: MediaStream | null;
  muted?: boolean;
  label: string;
  compact?: boolean;
}

export function VideoTile({ stream, muted, label, compact = true }: VideoTileProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [hasLiveVideo, setHasLiveVideo] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let videoTrack: MediaStreamTrack | undefined;
    const syncLive = () => {
      setHasLiveVideo(Boolean(videoTrack && videoTrack.enabled && videoTrack.readyState === 'live'));
    };

    const tryPlay = async () => {
      if (!stream || stream.getTracks().length === 0) {
        setNeedsGesture(false);
        return;
      }
      try {
        el.muted = true;
        await el.play();
        if (!muted) el.muted = false;
        setNeedsGesture(false);
      } catch {
        setNeedsGesture(true);
      }
    };

    const attach = () => {
      videoTrack?.removeEventListener('ended', syncLive);
      videoTrack?.removeEventListener('mute', syncLive);
      videoTrack?.removeEventListener('unmute', syncLive);
      videoTrack = stream?.getVideoTracks()[0];
      videoTrack?.addEventListener('ended', syncLive);
      videoTrack?.addEventListener('mute', syncLive);
      videoTrack?.addEventListener('unmute', syncLive);
      syncLive();
      el.srcObject = stream || null;
      el.playsInline = true;
      el.autoplay = true;
      void tryPlay();
    };

    attach();
    stream?.addEventListener('addtrack', attach);
    stream?.addEventListener('removetrack', attach);

    return () => {
      stream?.removeEventListener('addtrack', attach);
      stream?.removeEventListener('removetrack', attach);
      videoTrack?.removeEventListener('ended', syncLive);
      videoTrack?.removeEventListener('mute', syncLive);
      videoTrack?.removeEventListener('unmute', syncLive);
    };
  }, [stream, muted]);

  const playFromGesture = () => {
    const el = ref.current;
    if (!el) return;
    el.muted = Boolean(muted);
    void el
      .play()
      .then(() => setNeedsGesture(false))
      .catch(() => setNeedsGesture(true));
  };

  return (
    <div
      className={`relative bg-black overflow-hidden shrink-0 ring-1 ring-white/20 ${
        compact ? 'h-14 w-14 sm:h-[4.5rem] sm:w-[4.5rem] rounded-full' : 'h-24 sm:h-28 rounded-md w-full'
      }`}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full object-cover ${hasLiveVideo ? 'opacity-100' : 'opacity-0'}`}
      />
      {!hasLiveVideo && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-xs font-bold tracking-[0.18em] text-gray-300 text-center px-1 bg-black">
          CAM
        </div>
      )}
      {needsGesture && (
        <button
          type="button"
          onClick={playFromGesture}
          className="absolute inset-0 bg-black/55 text-[9px] sm:text-[10px] text-white font-medium"
        >
          Lire
        </button>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}
