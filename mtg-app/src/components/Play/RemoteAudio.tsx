import { useEffect, useRef, useState } from 'react';

interface RemoteAudioProps {
  stream: MediaStream;
  onBlockedChange?: (blocked: boolean) => void;
}

export function RemoteAudio({ stream, onBlockedChange }: RemoteAudioProps) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const tryPlay = () => {
      el.muted = false;
      el.volume = 1;
      void el
        .play()
        .then(() => onBlockedChange?.(false))
        .catch(() => onBlockedChange?.(true));
    };

    const attach = () => {
      el.srcObject = stream;
      el.autoplay = true;
      tryPlay();
    };

    attach();
    stream.addEventListener('addtrack', attach);
    stream.addEventListener('removetrack', attach);
    const unlock = () => tryPlay();
    document.addEventListener('pointerdown', unlock);

    return () => {
      stream.removeEventListener('addtrack', attach);
      stream.removeEventListener('removetrack', attach);
      document.removeEventListener('pointerdown', unlock);
    };
  }, [stream, onBlockedChange]);

  return <audio ref={ref} autoPlay playsInline />;
}

export function RemoteAudioHub({
  streams,
  onBlockedChange,
}: {
  streams: Record<string, MediaStream>;
  onBlockedChange?: (blocked: boolean) => void;
}) {
  const entries = Object.entries(streams);
  if (entries.length === 0) return null;
  return (
    <div className="sr-only">
      {entries.map(([userId, stream]) => (
        <RemoteAudio key={userId} stream={stream} onBlockedChange={onBlockedChange} />
      ))}
    </div>
  );
}

export function unlockRemoteAudio(): void {
  document.querySelectorAll('audio').forEach((el) => {
    el.muted = false;
    el.volume = 1;
    void el.play().catch(() => {});
  });
}
