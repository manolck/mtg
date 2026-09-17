import { useEffect, useRef } from 'react';

interface VideoTileProps {
  stream?: MediaStream | null;
  muted?: boolean;
  label: string;
  compact?: boolean;
}

export function VideoTile({ stream, muted, label, compact = true }: VideoTileProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream || null;
  }, [stream]);

  return (
    <div
      className={`relative bg-black overflow-hidden shrink-0 ring-1 ring-white/20 ${
        compact ? 'h-12 w-12 sm:h-16 sm:w-16 rounded-full' : 'h-24 sm:h-28 rounded-md w-full'
      }`}
    >
      <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-cover" />
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center text-[9px] text-gray-400 text-center px-1">
          {label.slice(0, 1).toUpperCase()}
        </div>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}
