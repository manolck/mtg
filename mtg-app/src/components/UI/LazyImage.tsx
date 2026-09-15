import { useState, useRef, useEffect, type ImgHTMLAttributes } from 'react';

// Étaler le chargement des images Scryfall pour éviter le rate limit (429) sur les premières cartes
const SCRYFALL_STAGGER_MS = 130;
const SCRYFALL_STAGGER_MAX = 12;
let scryfallStaggerCounter = 0;

interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'loading'> {
  src: string;
  alt: string;
  placeholder?: string;
  /**
   * Distance en pixels avant que l'image entre dans le viewport pour commencer le chargement
   * @default 200
   */
  rootMargin?: string;
  /**
   * Priorité de chargement : 'high' pour les images visibles immédiatement, 'low' pour les autres
   * @default 'low'
   */
  priority?: 'high' | 'low';
  /**
   * Afficher un placeholder pendant le chargement
   * @default true
   */
  showPlaceholder?: boolean;
}

/**
 * Composant d'image avec lazy loading intelligent utilisant IntersectionObserver
 *
 * - Charge l'image uniquement quand elle est proche du viewport
 * - Étale les requêtes vers Scryfall (CDN) pour limiter les 429 sur les premières cartes
 * - Retry automatique une fois en cas d'échec (rate limit / réseau)
 */
export function LazyImage({
  src,
  alt,
  placeholder,
  rootMargin = '200px',
  priority = 'low',
  showPlaceholder = true,
  className = '',
  onError,
  ...props
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority === 'high');
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const isScryfall = Boolean(src && src.includes('scryfall'));

  useEffect(() => {
    if (priority === 'high') {
      setIsInView(true);
      return;
    }

    const containerElement = containerRef.current;
    if (!containerElement) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            if (observerRef.current && containerElement) {
              observerRef.current.unobserve(containerElement);
            }
          }
        });
      },
      { rootMargin, threshold: 0.01 }
    );

    observerRef.current.observe(containerElement);

    return () => {
      if (observerRef.current && containerElement) {
        observerRef.current.unobserve(containerElement);
      }
    };
  }, [rootMargin, priority]);

  // Étaler le chargement des images Scryfall pour éviter le rate limit
  const [staggerReady, setStaggerReady] = useState(!isScryfall);
  useEffect(() => {
    if (!isScryfall || !isInView) return;
    const index = Math.min(scryfallStaggerCounter++, SCRYFALL_STAGGER_MAX);
    const delay = index * SCRYFALL_STAGGER_MS;
    const t = setTimeout(() => setStaggerReady(true), delay);
    return () => clearTimeout(t);
  }, [isScryfall, isInView]);

  const canLoad = isInView && (staggerReady || !isScryfall);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (retryKey === 0) {
      // Un seul retry après 1,5 s (souvent rate limit Scryfall)
      setTimeout(() => {
        setHasError(false);
        setRetryKey((k) => k + 1);
      }, 1500);
      return;
    }
    setHasError(true);
    onError?.(e);
  };

  if (hasError) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 ${className}`}
        style={props.style}
      >
        {placeholder || alt || 'Image non disponible'}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {showPlaceholder && !isLoaded && canLoad && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 animate-pulse">
          {placeholder ? (
            <span className="text-xs text-gray-400 dark:text-gray-600">{placeholder}</span>
          ) : (
            <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
          )}
        </div>
      )}

      {canLoad && (
        <img
          key={retryKey}
          ref={imgRef}
          src={src}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          className={`${className} ${!isLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
          style={props.style}
          loading={priority === 'high' ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority}
          {...Object.fromEntries(Object.entries(props).filter(([key]) => !['style', 'className', 'src', 'alt', 'onError', 'loading', 'decoding', 'fetchPriority'].includes(key)))}
        />
      )}

      {!canLoad && showPlaceholder && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          {placeholder ? (
            <span className="text-xs text-gray-400 dark:text-gray-600">{placeholder}</span>
          ) : (
            <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
          )}
        </div>
      )}
    </div>
  );
}

