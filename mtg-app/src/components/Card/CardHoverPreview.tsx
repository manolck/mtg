import { useEffect, useMemo, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { isCoarsePointer } from '../../utils/coarsePointer';

const PREVIEW_WIDTH = 280;
const PREVIEW_HEIGHT = PREVIEW_WIDTH * (88 / 63);
const GAP = 12;

function largeCardImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url
    .replace('/small/', '/large/')
    .replace('/normal/', '/large/')
    .replace('/art_crop/', '/large/');
}

interface CardHoverPreviewProps {
  imageUrl?: string;
  name: string;
  anchorRect: DOMRect;
  /** When set, tap outside (or Escape) closes — used for touch. */
  onDismiss?: () => void;
  onDoubleClick?: () => void;
}

export function CardHoverPreview({ imageUrl, name, anchorRect, onDismiss, onDoubleClick }: CardHoverPreviewProps) {
  const dismissible = Boolean(onDismiss);
  const src = largeCardImageUrl(imageUrl) || imageUrl;
  const tapFromPreview = Boolean(onDoubleClick);

  const placement = useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const center = dismissible || isCoarsePointer() || vw < 768;

    if (center) {
      const width = Math.min(PREVIEW_WIDTH * 1.15, vw - 32, ((vh - 48) * 63) / 88);
      return { center: true as const, width, height: width * (88 / 63) };
    }

    const width = PREVIEW_WIDTH;
    const height = PREVIEW_HEIGHT;
    let left = anchorRect.right + GAP;
    let top = anchorRect.top + anchorRect.height / 2 - height / 2;

    if (left + width > vw - 8) {
      left = anchorRect.left - width - GAP;
    }
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    if (top + height > vh - 8) {
      top = Math.max(8, vh - height - 8);
    }

    return { center: false as const, left, top, width, height };
  }, [anchorRect, dismissible]);

  useEffect(() => {
    if (!onDismiss) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const handlePreviewDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onDoubleClick) return;
    event.preventDefault();
    event.stopPropagation();
    onDoubleClick();
  };

  const card = (
    <div
      className={`overflow-hidden rounded-[18px] bg-black shadow-2xl ${
        dismissible || tapFromPreview ? 'pointer-events-auto' : 'pointer-events-none'
      } ${tapFromPreview ? 'cursor-pointer' : ''} ${placement.center ? '' : 'fixed z-[110]'}`}
      style={
        placement.center
          ? { width: placement.width, height: placement.height }
          : {
              left: placement.left,
              top: placement.top,
              width: placement.width,
              height: placement.height,
            }
      }
      role="img"
      aria-label={name}
      onClick={dismissible ? (event) => event.stopPropagation() : undefined}
      onDoubleClick={tapFromPreview ? handlePreviewDoubleClick : undefined}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className="pointer-events-none h-full w-full object-contain"
          style={{ borderRadius: '18px' }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-4">
          <p className="text-center text-sm text-gray-200">{name}</p>
        </div>
      )}
    </div>
  );

  if (dismissible) {
    return createPortal(
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
        onClick={onDismiss}
        role="presentation"
      >
        {card}
      </div>,
      document.body
    );
  }

  if (placement.center) {
    return createPortal(
      <div className="pointer-events-none fixed inset-0 z-[110] flex items-center justify-center p-4">
        {card}
      </div>,
      document.body
    );
  }

  return createPortal(card, document.body);
}
