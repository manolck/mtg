import { useState, useRef, useEffect } from 'react';
import { AvatarDisplay } from './AvatarDisplay';
import type { CollectionOwner } from '../../hooks/useAllCollections';

interface CollectionSelectorProps {
  owners: CollectionOwner[];
  currentUserId: string | null;
  selectedUserId: string | null;
  onSelect: (userId: string | null) => void;
  currentUserProfile?: { pseudonym?: string; avatarId?: string; email?: string } | null;
}

export function CollectionSelector({
  owners,
  currentUserId,
  selectedUserId,
  onSelect,
  currentUserProfile,
}: CollectionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const isAllCollections = selectedUserId === 'all';
  const currentOwner = owners.find(o => o.userId === (selectedUserId || currentUserId));
  
  const displayOwner = isAllCollections 
    ? { userId: 'all', profile: null, cardCount: owners.reduce((sum, o) => sum + o.cardCount, 0) }
    : currentOwner || {
        userId: currentUserId || '',
        profile: currentUserProfile || null,
        cardCount: 0,
      };

  const handleSelect = (userId: string | null | 'all') => {
    onSelect(userId);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Voir la collection de :
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[250px] flex items-center gap-3 justify-between"
      >
        <div className="flex items-center gap-3">
          {displayOwner.profile?.avatarId && (
            <AvatarDisplay avatarId={displayOwner.profile.avatarId} size="sm" />
          )}
          <span>
            {isAllCollections 
              ? `Toutes les collections (${displayOwner.cardCount} cartes)`
              : displayOwner.profile?.pseudonym || displayOwner.profile?.email || 'Ma collection'}
            {!isAllCollections && displayOwner.cardCount > 0 && ` (${displayOwner.cardCount} cartes)`}
          </span>
        </div>
        <svg
          className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {/* Option "Toutes les collections" */}
          <button
            type="button"
            onClick={() => handleSelect('all')}
            className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left ${
              isAllCollections ? 'bg-blue-50 dark:bg-blue-900/20' : ''
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
              🌐
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-900 dark:text-white">
                Toutes les collections
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {owners.reduce((sum, o) => sum + o.cardCount, 0)} cartes au total
              </div>
            </div>
          </button>

          {/* Séparateur */}
          {currentUserId && (
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          )}

          {/* Option "Ma collection" */}
          {currentUserId && (
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left ${
                !selectedUserId || selectedUserId === currentUserId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
            >
              {currentUserProfile?.avatarId && (
                <AvatarDisplay avatarId={currentUserProfile.avatarId} size="sm" />
              )}
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">
                  {currentUserProfile?.pseudonym || currentUserProfile?.email || 'Ma collection'}
                </div>
                {currentOwner && currentOwner.userId === currentUserId && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {currentOwner.cardCount} cartes
                  </div>
                )}
              </div>
            </button>
          )}

          {/* Séparateur */}
          {currentUserId && owners.filter(o => o.userId !== currentUserId).length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          )}

          {/* Autres collections */}
          {owners
            .filter(o => o.userId !== currentUserId)
            .map((owner) => (
              <button
                key={owner.userId}
                type="button"
                onClick={() => handleSelect(owner.userId)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
              >
                {owner.profile?.avatarId && (
                  <AvatarDisplay avatarId={owner.profile.avatarId} size="sm" />
                )}
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {owner.profile?.pseudonym || 'Utilisateur'}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {owner.cardCount} cartes
                  </div>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

