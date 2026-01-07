import { useState, useRef, useEffect, ImgHTMLAttributes } from 'react';

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
 * - Affiche un placeholder pendant le chargement
 * - Gère les erreurs de chargement
 * - Supporte la priorité de chargement (high/low)
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
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Si priorité haute, charger immédiatement
    if (priority === 'high') {
      setIsInView(true);
      return;
    }

    // Sinon, utiliser IntersectionObserver sur le container, pas l'image
    const containerElement = containerRef.current;
    if (!containerElement) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            // Arrêter d'observer une fois que l'image est en vue
            if (observerRef.current && containerElement) {
              observerRef.current.unobserve(containerElement);
            }
          }
        });
      },
      {
        rootMargin,
        threshold: 0.01, // Déclencher dès qu'un pixel est visible
      }
    );

    observerRef.current.observe(containerElement);

    return () => {
      if (observerRef.current && containerElement) {
        observerRef.current.unobserve(containerElement);
      }
    };
  }, [rootMargin, priority]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setHasError(true);
    if (onError) {
      onError(e);
    }
  };

  // Si erreur, afficher le placeholder ou un message
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
      {/* Placeholder pendant le chargement */}
      {showPlaceholder && !isLoaded && isInView && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 animate-pulse">
          {placeholder ? (
            <span className="text-xs text-gray-400 dark:text-gray-600">{placeholder}</span>
          ) : (
            <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
          )}
        </div>
      )}

      {/* Image réelle */}
      {isInView && (
        <img
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

      {/* Placeholder si l'image n'est pas encore en vue */}
      {!isInView && showPlaceholder && (
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

