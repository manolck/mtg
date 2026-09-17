import { useMemo } from 'react';
import { createPortal } from 'react-dom';

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
}

export function CardHoverPreview({ imageUrl, name, anchorRect }: CardHoverPreviewProps) {
  const style = useMemo(() => {
    const width = PREVIEW_WIDTH;
    const height = PREVIEW_HEIGHT;
    let left = anchorRect.right + GAP;
    let top = anchorRect.top + anchorRect.height / 2 - height / 2;

    if (left + width > window.innerWidth - 8) {
      left = anchorRect.left - width - GAP;
    }
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - height - 8);
    }

    return {
      left,
      top,
      width,
      height,
    };
  }, [anchorRect]);

  const src = largeCardImageUrl(imageUrl) || imageUrl;
  const coarsePointer =
    typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  if (coarsePointer) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[90] overflow-hidden rounded-[18px] bg-black shadow-2xl"
      style={style}
      role="img"
      aria-label={name}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-contain"
          style={{ borderRadius: '18px' }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-4">
          <p className="text-center text-sm text-gray-200">{name}</p>
        </div>
      )}
    </div>,
    document.body
  );
}
