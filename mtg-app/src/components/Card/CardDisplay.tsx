import { useState, useMemo, memo } from 'react';
import type { UserCard } from '../../types/card';
import { CardMenuModal } from '../UI/CardMenuModal';
import { AvatarDisplay } from '../UI/AvatarDisplay';
import { useToast } from '../../context/ToastContext';
import { errorHandler } from '../../services/errorHandler';

interface CardDisplayProps {
  card: UserCard;
  allCardsWithSameName?: UserCard[]; // Toutes les cartes avec le même nom
  onAddToDeck?: (cardId: string) => void;
  onAddToWishlist?: (card: UserCard) => void;
  onDelete?: (cardId: string) => void;
  onUpdateQuantity?: (cardId: string, quantity: number) => void;
  onEdit?: (card: UserCard) => void; // Pour ouvrir un menu d'édition personnalisé
  onReloadCard?: (cardId: string) => Promise<void>; // Fonction pour recharger la carte depuis l'API
  showQuantity?: boolean;
  showActions?: boolean;
}

export const CardDisplay = memo(function CardDisplay({ 
  card, 
  allCardsWithSameName,
  onAddToDeck,
  onAddToWishlist,
  onDelete,
  onUpdateQuantity,
  onEdit,
  onReloadCard,
  showActions = false 
}: CardDisplayProps) {
  const { showError } = useToast();
  const imageUrl = card.mtgData?.imageUrl;
  const backImageUrl = card.backImageUrl || card.backMtgData?.imageUrl;
  const isDoubleFaced = card.mtgData?.layout === 'transform' || card.name.includes(' // ');
  const cardName = card.name;
  
  const [showBackFace, setShowBackFace] = useState(false);

  const [showMenu, setShowMenu] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showEnlarged, setShowEnlarged] = useState(false);
  const [reloading, setReloading] = useState(false);

  // Grouper les cartes par langue pour l'affichage au survol
  const cardGroups = useMemo(() => {
    const cardsToGroup = allCardsWithSameName || [card];
    const groups = new Map<string, { language: string; quantity: number }>();
    let totalQuantity = 0;

    cardsToGroup.forEach((c) => {
      const lang = c.language || 'en';
      const key = lang;
      
      if (!groups.has(key)) {
        groups.set(key, {
          language: lang,
          quantity: 0,
        });
      }
      
      const group = groups.get(key)!;
      group.quantity += c.quantity;
      totalQuantity += c.quantity;
    });

    return {
      groups: Array.from(groups.values()).sort((a, b) => {
        return a.language.localeCompare(b.language);
      }),
      totalQuantity,
    };
  }, [allCardsWithSameName, card]);

  const getLanguageCode = (code: string): string => {
    return code.toUpperCase();
  };

  return (
    <>
    <div 
      className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col relative group cursor-pointer"
      onClick={(e) => {
        // Ne pas ouvrir la vue agrandie si on clique sur un bouton d'action
        if ((e.target as HTMLElement).closest('button')) {
          return;
        }
        setShowEnlarged(true);
      }}
      style={{
        transform: 'scale(1)',
        transition: 'transform 0.3s ease-in-out',
      }}
      onMouseEnter={(e) => {
        setShowMenu(true);
        (e.currentTarget as HTMLElement).style.transform = 'scale(1.2)';
        (e.currentTarget as HTMLElement).style.zIndex = '10';
      }}
      onMouseLeave={(e) => {
        setShowMenu(false);
        (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
        (e.currentTarget as HTMLElement).style.zIndex = '1';
      }}
    >
      {/* Image de la carte en entier */}
      <div className="relative w-full aspect-[63/88] bg-gray-100 dark:bg-gray-900">
        {isDoubleFaced && backImageUrl ? (
          // Carte double-face : animation de retournement 3D
          <div 
            className="relative w-full h-full cursor-pointer"
            style={{ 
              perspective: '1000px',
              WebkitPerspective: '1000px',
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowBackFace(!showBackFace);
            }}
          >
            <div 
              className="relative w-full h-full"
              style={{
                transformStyle: 'preserve-3d',
                WebkitTransformStyle: 'preserve-3d',
                transform: showBackFace ? 'rotateY(180deg)' : 'rotateY(0deg)',
                transition: 'transform 0.7s cubic-bezier(0.4, 0.0, 0.2, 1)',
                WebkitTransition: 'transform 0.7s cubic-bezier(0.4, 0.0, 0.2, 1)',
              }}
            >
              {/* Face avant */}
              <div 
                className="absolute inset-0"
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(0deg)',
                }}
              >
                <img
                  src={imageUrl}
                  alt={`${cardName} - Face avant`}
                  className="w-full h-full object-contain"
                  style={{ borderRadius: '15px' }}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              {/* Face arrière */}
              <div 
                className="absolute inset-0"
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                }}
              >
                <img
                  src={backImageUrl}
                  alt={`${cardName} - Face arrière`}
                  className="w-full h-full object-contain"
                  style={{ borderRadius: '15px' }}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
            {/* Indicateur pour montrer qu'on peut cliquer pour basculer */}
            <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none z-10">
              {showBackFace ? 'Face arrière' : 'Face avant'}
            </div>
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={cardName}
            className="w-full h-full object-contain"
            style={{ borderRadius: '15px' }}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            onError={(e) => {
              // Fallback si l'image ne charge pas
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 relative">
            <p className="text-gray-500 dark:text-gray-400 text-sm text-center font-medium mb-4">
              {cardName}
            </p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mb-4">
              Image non disponible
            </p>
          </div>
        )}

        {/* Overlay d'informations en bas - visible au survol */}
        {showMenu && (cardGroups.totalQuantity > 0 || card.ownerProfile?.avatarId) && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/30 backdrop-blur-sm text-white p-2 transition-opacity duration-200">
            <div className="flex items-center justify-between text-xs">
              {/* Langues avec quantités */}
              {cardGroups.totalQuantity > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {cardGroups.groups.map((group, index) => (
                    <span key={index} className="font-medium whitespace-nowrap">
                      {`${group.quantity} ${getLanguageCode(group.language)}`}
                      {index < cardGroups.groups.length - 1 && <span className="mx-1">|</span>}
                    </span>
                  ))}
                </div>
              )}
              
              {/* Avatar du propriétaire à droite avec tooltip */}
              {card.ownerProfile?.avatarId && (
                <div className="relative group/owner ml-auto">
                  <div className="w-4 h-4 flex-shrink-0 overflow-hidden rounded-full border border-white/30">
                    <AvatarDisplay 
                      avatarId={card.ownerProfile.avatarId} 
                      size="sm"
                      className="!w-4 !h-4 !text-[10px] !border-0"
                    />
                  </div>
                  {/* Tooltip avec le pseudonyme au survol */}
                  {card.ownerProfile.pseudonym && (
                    <div className="absolute bottom-full right-0 mb-1 px-2 py-1 bg-black/90 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/owner:opacity-100 transition-opacity pointer-events-none z-20">
                      {card.ownerProfile.pseudonym}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bouton Recharger en haut à gauche - visible au survol */}
        {onReloadCard && (
          <div className={`absolute top-2 left-2 transition-opacity duration-200 ${showMenu ? 'opacity-100' : 'opacity-0'}`}>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  setReloading(true);
                  await onReloadCard(card.id);
                } catch (err) {
                  errorHandler.handleAndShowError(err);
                } finally {
                  setReloading(false);
                }
              }}
              disabled={reloading}
              className="w-8 h-8 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm flex items-center justify-center shadow-lg hover:bg-white dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Recharger la carte"
            >
              {reloading ? (
                <svg className="w-5 h-5 text-gray-700 dark:text-gray-300 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </button>
          </div>
        )}

        {/* Boutons d'action en haut à droite - visibles au survol */}
        <div className={`absolute top-2 right-2 flex gap-2 transition-opacity duration-200 ${showMenu ? 'opacity-100' : 'opacity-0'}`}>
          {/* Bouton Ajouter au deck */}
          {onAddToDeck && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToDeck(card.id);
              }}
              className="w-8 h-8 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm flex items-center justify-center shadow-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
              title="Ajouter au deck"
            >
              <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}

          {/* Bouton Ajouter à la wishlist */}
          {onAddToWishlist && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToWishlist(card);
              }}
              className="w-8 h-8 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm flex items-center justify-center shadow-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
              title="Ajouter à la wishlist"
            >
              <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          )}

          {/* Bouton Crayon pour modifier */}
          {showActions && (onEdit || onUpdateQuantity || onDelete) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onEdit) {
                  onEdit(card);
                } else {
                  setShowMenuModal(true);
                }
              }}
              className="w-8 h-8 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm flex items-center justify-center shadow-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
              title="Modifier"
            >
              <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}

          {/* Bouton Supprimer */}
          {showActions && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // La suppression est gérée par CardMenuModal avec ConfirmDialog
                onDelete(card.id);
              }}
              className="w-8 h-8 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm flex items-center justify-center shadow-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Supprimer"
            >
              <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>


      {/* Modal pour les options de modification */}
      {showActions && (
        <CardMenuModal
          isOpen={showMenuModal}
          onClose={() => setShowMenuModal(false)}
          card={card}
          allCardsWithSameName={allCardsWithSameName || [card]}
          onUpdateQuantity={onUpdateQuantity}
          onDelete={onDelete}
        />
      )}
    </div>

    {/* Modal pour la vue agrandie de la carte */}
    {showEnlarged && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={() => setShowEnlarged(false)}
        style={{ animation: 'fadeIn 0.2s ease-in-out' }}
      >
        <div
          className="relative"
          style={{
            width: '80vw',
            aspectRatio: '63/88',
            maxWidth: '90vw',
            maxHeight: '90vh',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {isDoubleFaced && backImageUrl ? (
            // Carte double-face en grand
            <div 
              className="relative w-full h-full cursor-pointer"
              style={{ 
                perspective: '1000px',
                WebkitPerspective: '1000px',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setShowBackFace(!showBackFace);
              }}
            >
              <div 
                className="relative w-full h-full"
                style={{
                  transformStyle: 'preserve-3d',
                  WebkitTransformStyle: 'preserve-3d',
                  transform: showBackFace ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  transition: 'transform 0.7s cubic-bezier(0.4, 0.0, 0.2, 1)',
                  WebkitTransition: 'transform 0.7s cubic-bezier(0.4, 0.0, 0.2, 1)',
                }}
              >
                {/* Face avant */}
                <div 
                  className="absolute inset-0"
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(0deg)',
                  }}
                >
                  <img
                    src={imageUrl}
                    alt={`${cardName} - Face avant`}
                    className="w-full h-full object-contain rounded-lg shadow-2xl"
                    style={{ borderRadius: '15px' }}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="high"
                  />
                </div>
                {/* Face arrière */}
                <div 
                  className="absolute inset-0"
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}
                >
                  <img
                    src={backImageUrl}
                    alt={`${cardName} - Face arrière`}
                    className="w-full h-full object-contain rounded-lg shadow-2xl"
                    style={{ borderRadius: '15px' }}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="high"
                  />
                </div>
              </div>
              {/* Indicateur pour montrer qu'on peut cliquer pour basculer */}
              <div className="absolute bottom-4 right-4 bg-black/70 text-white text-sm px-3 py-2 rounded pointer-events-none z-10">
                {showBackFace ? 'Face arrière' : 'Face avant'}
              </div>
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={cardName}
              className="w-full h-full object-contain rounded-lg shadow-2xl"
              style={{ borderRadius: '15px' }}
              loading="lazy"
              decoding="async"
              fetchPriority="high"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-lg">
              <p className="text-gray-500 dark:text-gray-400 text-xl text-center font-medium mb-4">
                {cardName}
              </p>
              <p className="text-gray-400 dark:text-gray-500 text-sm">
                Image non disponible
              </p>
            </div>
          )}
          
          {/* Bouton fermer */}
          <button
            onClick={() => setShowEnlarged(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center transition-colors z-20"
            title="Fermer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    )}
    </>
  );
}, (prevProps, nextProps) => {
  // Comparaison personnalisée pour éviter les re-renders inutiles
  // On compare seulement les propriétés qui affectent l'affichage
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.quantity === nextProps.card.quantity &&
    prevProps.card.mtgData?.imageUrl === nextProps.card.mtgData?.imageUrl &&
    prevProps.card.backImageUrl === nextProps.card.backImageUrl &&
    prevProps.card.ownerProfile?.avatarId === nextProps.card.ownerProfile?.avatarId &&
    prevProps.card.ownerProfile?.pseudonym === nextProps.card.ownerProfile?.pseudonym &&
    prevProps.showActions === nextProps.showActions &&
    prevProps.showQuantity === nextProps.showQuantity &&
    // Comparer les références des fonctions (elles ne devraient pas changer)
    prevProps.onAddToDeck === nextProps.onAddToDeck &&
    prevProps.onAddToWishlist === nextProps.onAddToWishlist &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.onUpdateQuantity === nextProps.onUpdateQuantity &&
    prevProps.onReloadCard === nextProps.onReloadCard &&
    // Comparer allCardsWithSameName par longueur et IDs (simplifié)
    (prevProps.allCardsWithSameName?.length ?? 0) === (nextProps.allCardsWithSameName?.length ?? 0)
  );
});

