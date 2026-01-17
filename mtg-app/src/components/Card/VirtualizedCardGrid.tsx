import { useMemo, useCallback, useState, useEffect, useRef, createElement } from 'react';
import type { UserCard } from '../../types/card';
import { CardDisplay } from './CardDisplay';

// Fonction pour charger react-window dynamiquement
const loadReactWindow = async () => {
  try {
    const rwModule = await import('react-window');
    return rwModule.FixedSizeGrid;
  } catch (e: any) {
    console.error('Failed to import react-window:', e);
    return null;
  }
};

interface VirtualizedCardGridProps {
  cards: UserCard[];
  cardsByNameMap?: {
    deduplicatedCards: UserCard[];
    map: Map<string, UserCard[]>;
  };
  onAddToDeck?: (cardId: string) => void;
  onAddToWishlist?: (card: UserCard) => void;
  onDelete?: (cardId: string) => void;
  onUpdateQuantity?: (cardId: string, quantity: number) => void;
  onEdit?: (card: UserCard) => void;
  showActions?: boolean;
  gap?: number;
  // Pour les cartes de wishlist avec des props supplémentaires
  renderCardWrapper?: (card: UserCard, index: number) => React.ReactNode;
}

// Breakpoints pour le nombre de colonnes (basés sur Tailwind)
const getColumnCount = (width: number): number => {
  if (width < 640) return 1; // sm
  if (width < 768) return 2; // md
  if (width < 1024) return 3; // lg
  if (width < 1280) return 4; // xl
  return 5; // 2xl+
};

// Hauteur estimée d'une carte (aspect ratio 63/88 + padding)
const CARD_HEIGHT = 400; // Hauteur approximative d'une carte avec espacement

export function VirtualizedCardGrid({
  cards,
  cardsByNameMap,
  onAddToDeck,
  onAddToWishlist,
  onDelete,
  onUpdateQuantity,
  onEdit,
  showActions = false,
  gap = 24,
  renderCardWrapper,
}: VirtualizedCardGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [containerHeight, setContainerHeight] = useState(800);

  // Observer pour détecter les changements de taille du conteneur
  useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;
    let cleanup: (() => void) | null = null;

    // Attendre que le DOM soit monté
    const initTimeout = setTimeout(() => {
      const container = containerRef.current;
      if (!container) {
        console.warn('VirtualizedCardGrid: container ref is null after timeout');
        return;
      }

      const updateSize = () => {
        try {
          const rect = container.getBoundingClientRect();
          const width = rect.width || container.offsetWidth || window.innerWidth;
          // Utiliser la hauteur du conteneur ou calculer depuis la fenêtre
          const height = rect.height || window.innerHeight - 300;
          
          if (width > 0 && height > 0) {
            setContainerWidth(width);
            setContainerHeight(Math.max(height, 600)); // Minimum 600px
          }
        } catch (error) {
          console.error('VirtualizedCardGrid: Error updating size:', error);
        }
      };

      // Initialiser la taille immédiatement
      updateSize();

      // Observer les changements de taille
      try {
        resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(container);
      } catch (error) {
        console.warn('VirtualizedCardGrid: ResizeObserver not supported, using window resize only');
      }

      // Écouter aussi les changements de taille de la fenêtre
      window.addEventListener('resize', updateSize);

      // Fonction de cleanup
      cleanup = () => {
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
        window.removeEventListener('resize', updateSize);
      };
    }, 100);

    return () => {
      clearTimeout(initTimeout);
      if (cleanup) {
        cleanup();
      }
    };
  }, []);

  // Calculer le nombre de colonnes et de lignes
  const columnCount = useMemo(() => getColumnCount(containerWidth), [containerWidth]);
  const columnWidth = useMemo(() => {
    if (columnCount === 0) return 200; // Valeur par défaut
    return Math.max((containerWidth - gap * (columnCount - 1)) / columnCount, 100);
  }, [containerWidth, columnCount, gap]);

  // Utiliser cardsByNameMap si fourni, sinon utiliser cards directement
  const displayCards = useMemo(() => {
    if (cardsByNameMap) {
      return cardsByNameMap.deduplicatedCards;
    }
    return cards;
  }, [cards, cardsByNameMap]);

  const rowCount = useMemo(() => {
    if (columnCount === 0) return 0;
    return Math.ceil(displayCards.length / columnCount);
  }, [displayCards.length, columnCount]);

  // Fonction pour rendre une cellule
  // react-window v2 attend: ({ columnIndex, rowIndex, style, ariaAttributes }) => ReactElement
  const Cell = useCallback(
    ({ columnIndex, rowIndex, style }: { 
      columnIndex: number; 
      rowIndex: number; 
      style: React.CSSProperties;
      [key: string]: any;
    }) => {
      try {
        const index = rowIndex * columnCount + columnIndex;
        const card = displayCards[index];

        if (!card) {
          return <div style={style} />;
        }

        // Utiliser cardsByNameMap si disponible
        const cardsWithSameName = cardsByNameMap
          ? cardsByNameMap.map.get(card.name) || [card]
          : [card];

        const cardElement = (
          <CardDisplay
            key={card.id}
            card={card}
            allCardsWithSameName={cardsWithSameName}
            onAddToDeck={onAddToDeck}
            onAddToWishlist={onAddToWishlist}
            onDelete={onDelete}
            onUpdateQuantity={onUpdateQuantity}
            onEdit={onEdit}
            showActions={showActions}
          />
        );

        // Si un wrapper personnalisé est fourni, l'utiliser
        if (renderCardWrapper) {
          return (
            <div style={{ ...style, padding: `${gap / 2}px` }}>
              {renderCardWrapper(card, index)}
            </div>
          );
        }

        return (
          <div style={{ ...style, padding: `${gap / 2}px` }}>
            {cardElement}
          </div>
        );
      } catch (error) {
        console.error('Error rendering cell:', error);
        return <div style={style}>Erreur de rendu</div>;
      }
    },
    [
      displayCards,
      columnCount,
      cardsByNameMap,
      onAddToDeck,
      onAddToWishlist,
      onDelete,
      onUpdateQuantity,
      onEdit,
      showActions,
      gap,
      renderCardWrapper,
    ]
  );

  // Si pas de cartes, ne rien afficher
  if (displayCards.length === 0) {
    return null;
  }


  // S'assurer que les dimensions sont valides AVANT de rendre quoi que ce soit
  if (containerWidth <= 0 || containerHeight <= 0 || columnCount === 0) {
    return (
      <div ref={containerRef} className="w-full" style={{ minHeight: '600px' }}>
        <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
          Chargement... (dimensions: {containerWidth}x{containerHeight}, colonnes: {columnCount})
        </div>
      </div>
    );
  }

  // S'assurer que rowCount est valide
  if (rowCount === 0) {
    console.warn('VirtualizedCardGrid: rowCount is 0, no cards to display');
    return (
      <div ref={containerRef} className="w-full" style={{ minHeight: '600px' }}>
        <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
          Aucune carte à afficher
        </div>
      </div>
    );
  }

  // Utiliser useRef pour stocker gridComponent et éviter les réinitialisations lors des re-renders
  const gridComponentRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [gridComponentReady, setGridComponentReady] = useState(false);

  useEffect(() => {
    // Ne charger qu'une seule fois si déjà chargé
    if (gridComponentRef.current) {
      setLoading(false);
      setGridComponentReady(true);
      return;
    }

    loadReactWindow()
      .then((loadedGrid) => {
        if (loadedGrid) {
          gridComponentRef.current = loadedGrid;
          setGridComponentReady(true);
          setLoading(false);
        } else {
          setLoadError(new Error('Failed to load Grid component'));
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error('Error loading react-window:', error);
        setLoadError(error);
        setLoading(false);
      });
  }, []);

  // Composant de fallback
  const FallbackGrid = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      {displayCards.map((card) => {
        const cardsWithSameName = cardsByNameMap
          ? cardsByNameMap.map.get(card.name) || [card]
          : [card];
        
        return (
          <CardDisplay
            key={card.id}
            card={card}
            allCardsWithSameName={cardsWithSameName}
            onAddToDeck={onAddToDeck}
            onAddToWishlist={onAddToWishlist}
            onDelete={onDelete}
            onUpdateQuantity={onUpdateQuantity}
            onEdit={onEdit}
            showActions={showActions}
          />
        );
      })}
    </div>
  );

  // Vérifier que toutes les valeurs sont valides avant de rendre Grid
  if (!Number.isFinite(columnCount) || columnCount <= 0 ||
      !Number.isFinite(columnWidth) || columnWidth <= 0 ||
      !Number.isFinite(containerHeight) || containerHeight <= 0 ||
      !Number.isFinite(rowCount) || rowCount <= 0 ||
      !Number.isFinite(CARD_HEIGHT) || CARD_HEIGHT <= 0 ||
      !Number.isFinite(containerWidth) || containerWidth <= 0) {
    console.error('VirtualizedCardGrid: Invalid dimensions', {
      columnCount, columnWidth, containerHeight, rowCount, containerWidth, CARD_HEIGHT
    });
    return (
      <div ref={containerRef} className="w-full" style={{ minHeight: '600px' }}>
        <FallbackGrid />
      </div>
    );
  }

  // Vérifier que Cell est bien défini
  if (!Cell || typeof Cell !== 'function') {
    console.error('VirtualizedCardGrid: Cell is not a valid function', Cell);
    return (
      <div ref={containerRef} className="w-full" style={{ minHeight: '600px' }}>
        <FallbackGrid />
      </div>
    );
  }
  
  // Utiliser gridComponentRef au lieu de gridComponent state (déclarer AVANT utilisation)
  const gridComponent = gridComponentRef.current;

  // Vérifier une dernière fois que toutes les valeurs sont valides
  const props = {
    columnCount: Math.max(1, Math.floor(columnCount)),
    columnWidth: Math.max(50, Math.floor(columnWidth)),
    height: Math.max(100, Math.floor(containerHeight)),
    rowCount: Math.max(1, Math.floor(rowCount)),
    rowHeight: Math.max(100, Math.floor(CARD_HEIGHT)),
    width: Math.max(100, Math.floor(containerWidth)),
  };

  // Si en cours de chargement, afficher un message
  if (loading) {
    return (
      <div ref={containerRef} className="w-full" style={{ minHeight: '600px' }}>
        <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
          Chargement de la virtualisation...
        </div>
      </div>
    );
  }

  // Si erreur de chargement ou Grid non disponible, utiliser le fallback
  if (loadError || !gridComponent || !gridComponentReady) {
    if (loadError) {
      console.warn('VirtualizedCardGrid: Using fallback due to load error:', loadError);
    }
    return (
      <div ref={containerRef} className="w-full" style={{ minHeight: '600px' }}>
        <FallbackGrid />
      </div>
    );
  }

  // Vérifier que toutes les props sont valides
  if (!props.columnCount || !props.columnWidth || !props.height || 
      !props.rowCount || !props.rowHeight || !props.width) {
    console.error('VirtualizedCardGrid: Invalid props after normalization', props);
    return (
      <div ref={containerRef} className="w-full" style={{ minHeight: '600px' }}>
        <FallbackGrid />
      </div>
    );
  }

  try {
    // react-window v1 utilise children comme fonction render prop
    // La signature est: ({ columnIndex, rowIndex, style }) => ReactElement
    // Utiliser createElement pour éviter les problèmes de contexte avec les composants chargés dynamiquement
    return (
      <div ref={containerRef} className="w-full bg-gray-50 dark:bg-gray-900" style={{ minHeight: '600px' }}>
        {createElement(gridComponent, {
          columnCount: props.columnCount,
          columnWidth: props.columnWidth,
          height: props.height,
          rowCount: props.rowCount,
          rowHeight: props.rowHeight,
          width: props.width,
          style: { overflowX: 'hidden', backgroundColor: 'transparent' },
          children: Cell,
        })}
      </div>
    );
  } catch (error: any) {
    console.error('Error rendering VirtualizedCardGrid:', error);
    return (
      <div ref={containerRef} className="w-full bg-gray-50 dark:bg-gray-900" style={{ minHeight: '600px' }}>
        <FallbackGrid />
      </div>
    );
  }
}

