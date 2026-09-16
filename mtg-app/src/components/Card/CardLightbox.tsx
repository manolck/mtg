import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface CardLightboxProps {
  imageUrl?: string;
  name: string;
  onClose: () => void;
}

export function CardLightbox({ imageUrl, name, onClose }: CardLightboxProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={name}
      style={{ animation: 'fadeIn 0.2s ease-in-out' }}
    >
      <div
        className="relative bg-black shadow-2xl"
        style={{
          width: 'min(90vw, calc(90vh * 63 / 88))',
          height: 'min(90vh, calc(90vw * 88 / 63))',
          aspectRatio: '63/88',
          borderRadius: '20px',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-contain"
            style={{ borderRadius: '20px' }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center p-8">
            <p className="mb-2 text-center text-xl font-medium text-gray-200">{name}</p>
            <p className="text-sm text-gray-400">Image non disponible</p>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90"
          title="Fermer"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>,
    document.body
  );
}
