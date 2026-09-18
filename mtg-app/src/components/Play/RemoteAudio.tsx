import { useEffect, useRef, useState } from 'react';

interface RemoteAudioProps {
  stream: MediaStream;
}

export function RemoteAudio({ stream }: RemoteAudioProps) {
  const ref = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const tryPlay = () => {
      el.muted = false;
      el.volume = 1;
      void el
        .play()
        .then(() => setBlocked(false))
        .catch(() => setBlocked(true));
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
  }, [stream]);

  return (
    <>
      <audio ref={ref} autoPlay playsInline />
      {blocked ? <span className="sr-only">Cliquez pour entendre les autres joueurs</span> : null}
    </>
  );
}

export function RemoteAudioHub({ streams }: { streams: Record<string, MediaStream> }) {
  const entries = Object.entries(streams);
  if (entries.length === 0) return null;
  return (
    <div className="sr-only" aria-hidden>
      {entries.map(([userId, stream]) => (
        <RemoteAudio key={userId} stream={stream} />
      ))}
    </div>
  );
}
