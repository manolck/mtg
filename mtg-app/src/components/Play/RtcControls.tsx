interface RtcControlsProps {
  camOn: boolean;
  micOn: boolean;
  onToggleCam: () => void;
  onToggleMic: () => void;
  disabled?: boolean;
}

export function RtcControls({ camOn, micOn, onToggleCam, onToggleMic, disabled }: RtcControlsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggleMic}
        disabled={disabled}
        title={micOn ? 'Couper le micro' : 'Activer le micro'}
        className={`h-9 w-9 rounded-full flex items-center justify-center text-sm disabled:opacity-50 ${
          micOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-600 hover:bg-red-500'
        }`}
      >
        {micOn ? '🎤' : '🔇'}
      </button>
      <button
        type="button"
        onClick={onToggleCam}
        disabled={disabled}
        title={camOn ? 'Couper la caméra' : 'Activer la caméra'}
        className={`h-9 w-9 rounded-full flex items-center justify-center text-sm disabled:opacity-50 ${
          camOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-600 hover:bg-red-500'
        }`}
      >
        {camOn ? '📷' : '🚫'}
      </button>
    </div>
  );
}
