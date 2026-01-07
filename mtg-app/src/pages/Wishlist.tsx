import { useState, useMemo, useDeferredValue } from 'react';
import { useWishlist } from '../hooks/useWishlist';
import { useCollection } from '../hooks/useCollection';
import { useAuth } from '../hooks/useAuth';
import { CardDisplay } from '../components/Card/CardDisplay';
import { VirtualizedCardGrid } from '../components/Card/VirtualizedCardGrid';
import { Button } from '../components/UI/Button';
import { Spinner } from '../components/UI/Spinner';
import { Modal } from '../components/UI/Modal';
import { downloadWishlist } from '../services/wishlistExportService';
import { WishlistCardMenuModal } from '../components/Wishlist/WishlistCardMenuModal';
import { WishlistSearchInput } from '../components/Wishlist/WishlistSearchInput';
import type { WishlistItem } from '../types/card';
import type { MTGCard } from '../types/card';

type SortOption = 'name' | 'date' | 'rarity' | 'set' | 'quantity';

export function Wishlist() {
  const { currentUser } = useAuth();
  const {
    items,
    loading,
    error,
    removeItem,
    updateItem,
    clearWishlist,
    addItem,
    checkIfInWishlist,
  } = useWishlist(currentUser?.uid);
  
  // Charger toutes les collections de la communauté pour permettre les échanges/achats
  const { cards: allCommunityCards } = useCollection('all');

  const [searchInput, setSearchInput] = useState('');
  const [selectedRarity, setSelectedRarity] = useState<string | null>(null);
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedItemForMenu, setSelectedItemForMenu] = useState<WishlistItem | null>(null);

  const deferredSearch = useDeferredValue(searchInput);

  // Créer un Set des noms de cartes dans la collection de l'utilisateur pour comparaison rapide
  const { cards: userCollectionCards } = useCollection(currentUser?.uid);
  const collectionCardNames = useMemo(() => {
    return new Set(userCollectionCards.map(card => card.name.toLowerCase()));
  }, [userCollectionCards]);

  // Filtrage et recherche
  const filteredItems = useMemo(() => {
    let filtered = items;

    // Recherche par nom, type, type de créature, description et notes
    if (deferredSearch) {
      const searchLower = deferredSearch.toLowerCase();
      filtered = filtered.filter(item => {
        // Recherche dans le nom (priorité)
        const nameMatch = item.name.toLowerCase().includes(searchLower);
        
        // Recherche dans le type de carte (Créature, Instant, etc.)
        const typeMatch = item.mtgData?.type?.toLowerCase().includes(searchLower) ||
                         item.mtgData?.types?.some(t => t.toLowerCase().includes(searchLower));
        
        // Recherche dans les types de créature (Gobelin, Elfe, etc.)
        const subtypeMatch = item.mtgData?.subtypes?.some(st => st.toLowerCase().includes(searchLower));
        
        // Recherche dans la description/oracle text
        const textMatch = item.mtgData?.text?.toLowerCase().includes(searchLower);
        
        // Recherche dans les notes
        const notesMatch = item.notes?.toLowerCase().includes(searchLower);
        
        return nameMatch || typeMatch || subtypeMatch || textMatch || notesMatch;
      });
    }

    // Filtre par rareté
    if (selectedRarity) {
      filtered = filtered.filter(item => item.rarity === selectedRarity);
    }

    // Filtre par set
    if (selectedSet) {
      filtered = filtered.filter(item => item.setCode === selectedSet || item.set === selectedSet);
    }

    // Tri
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'date':
          return b.createdAt.getTime() - a.createdAt.getTime();
        case 'rarity':
          const rarityOrder: Record<string, number> = {
            'Mythic': 1,
            'Rare': 2,
            'Uncommon': 3,
            'Common': 4,
          };
          const aRarity = rarityOrder[a.rarity || ''] || 99;
          const bRarity = rarityOrder[b.rarity || ''] || 99;
          return aRarity - bRarity;
        case 'set':
          const aSet = (a.setCode || a.set || '').toLowerCase();
          const bSet = (b.setCode || b.set || '').toLowerCase();
          return aSet.localeCompare(bSet);
        case 'quantity':
          return b.quantity - a.quantity;
        default:
          return 0;
      }
    });

    return filtered;
  }, [items, deferredSearch, selectedRarity, selectedSet, sortBy]);

  // Statistiques améliorées
  const stats = useMemo(() => {
    const totalItems = items.length;
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const uniqueSets = new Set(items.map(item => item.setCode || item.set).filter(Boolean)).size;
    
    // Cartes déjà dans la collection
    const alreadyInCollection = items.filter(item =>
      collectionCardNames.has(item.name.toLowerCase())
    ).length;
    
    // Cartes avec notes
    const withNotes = items.filter(item => item.notes).length;
    
    // Cartes avec prix cible
    const withTargetPrice = items.filter(item => item.targetPrice).length;
    
    const rarities = items.reduce((acc, item) => {
      const rarity = item.rarity || 'Unknown';
      acc[rarity] = (acc[rarity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalItems,
      totalQuantity,
      uniqueSets,
      alreadyInCollection,
      withNotes,
      withTargetPrice,
      rarities,
    };
  }, [items, collectionCardNames]);

  // Raretés uniques pour le filtre
  const uniqueRarities = useMemo(() => {
    return Array.from(new Set(items.map(item => item.rarity).filter(Boolean))) as string[];
  }, [items]);

  // Sets uniques pour le filtre
  const uniqueSets = useMemo(() => {
    return Array.from(
      new Set(
        items
          .map(item => item.setCode || item.set)
          .filter(Boolean)
      )
    ).sort() as string[];
  }, [items]);

  const handleDelete = async (itemId: string) => {
    try {
      await removeItem(itemId);
    } catch (error) {
      console.error('Error deleting wishlist item:', error);
      alert('Erreur lors de la suppression de l\'item');
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer tous les items de votre wishlist ?')) {
      return;
    }

    try {
      await clearWishlist();
      setShowDeleteModal(false);
    } catch (error) {
      console.error('Error clearing wishlist:', error);
      alert('Erreur lors de la suppression de la wishlist');
    }
  };

  const handleOpenMenu = (item: WishlistItem) => {
    setSelectedItemForMenu(item);
  };

  const handleUpdateItem = async (itemId: string, updates: { quantity: number; notes?: string; targetPrice?: number }) => {
    try {
      await updateItem(itemId, updates);
      setSelectedItemForMenu(null);
    } catch (error) {
      console.error('Error updating wishlist item:', error);
      alert('Erreur lors de la mise à jour de l\'item');
    }
  };

  const handleExport = (format: 'csv' | 'json') => {
    try {
      downloadWishlist(items, format);
    } catch (error) {
      console.error('Error exporting wishlist:', error);
      alert('Erreur lors de l\'export');
    }
  };

  const handleAddCardFromSearch = async (card: MTGCard) => {
    try {
      // Vérifier si la carte est déjà dans la wishlist
      const alreadyInWishlist = await checkIfInWishlist(
        card.name,
        card.set,
        card.number
      );

      if (alreadyInWishlist) {
        alert(`${card.name} est déjà dans votre wishlist`);
        return;
      }

      // Ajouter la carte à la wishlist
      await addItem(
        card.name,
        1,
        card,
        card.set,
        card.number,
        card.rarity,
        'en' // Langue par défaut
      );

      alert(`${card.name} a été ajoutée à votre wishlist`);
    } catch (error) {
      console.error('Error adding card to wishlist:', error);
      alert('Erreur lors de l\'ajout à la wishlist');
    }
  };

  const isCardInCollection = (itemName: string): boolean => {
    return collectionCardNames.has(itemName.toLowerCase());
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-red-500">
          Erreur lors du chargement de la wishlist: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Ma Wishlist
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gérez les cartes que vous souhaitez acquérir
          </p>
        </div>
        {items.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => setShowExportModal(true)}
          >
            Exporter
          </Button>
        )}
      </div>

      {/* Statistiques améliorées */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total d'items</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.totalItems}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Quantité totale</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.totalQuantity}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Éditions</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.uniqueSets}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Déjà possédées</div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {stats.alreadyInCollection}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Avec notes</div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {stats.withNotes}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Prix cible</div>
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {stats.withTargetPrice}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Filtrées</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {filteredItems.length}
          </div>
        </div>
      </div>

      {/* Filtres, recherche et tri */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <WishlistSearchInput
              value={searchInput}
              onChange={setSearchInput}
              onSelectCard={handleAddCardFromSearch}
              collectionCards={allCommunityCards}
              placeholder="Rechercher dans toutes les collections de la communauté..."
            />
          </div>
          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rareté
            </label>
            <select
              value={selectedRarity || ''}
              onChange={(e) => setSelectedRarity(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Toutes</option>
              {uniqueRarities.map(rarity => (
                <option key={rarity} value={rarity}>
                  {rarity}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Édition
            </label>
            <select
              value={selectedSet || ''}
              onChange={(e) => setSelectedSet(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Toutes</option>
              {uniqueSets.map(set => (
                <option key={set} value={set}>
                  {set}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Trier par
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="date">Date d'ajout</option>
              <option value="name">Nom</option>
              <option value="rarity">Rareté</option>
              <option value="set">Édition</option>
              <option value="quantity">Quantité</option>
            </select>
          </div>
        </div>
        {items.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={() => setShowDeleteModal(true)}
            >
              Supprimer tout
            </Button>
          </div>
        )}
      </div>

      {/* Liste des items */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
            {items.length === 0
              ? 'Votre wishlist est vide'
              : 'Aucune carte ne correspond à vos filtres'}
          </p>
          {items.length === 0 && (
            <p className="text-gray-500 dark:text-gray-500 text-sm">
              Ajoutez des cartes depuis la page Collection pour commencer
            </p>
          )}
        </div>
      ) : filteredItems.length > 100 ? (
        // Utiliser la virtualisation pour les grandes wishlists (> 100 items)
        <div className="w-full bg-gray-50 dark:bg-gray-900" style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}>
          <VirtualizedCardGrid
            cards={filteredItems.map(item => ({
              id: item.id,
              name: item.name,
              quantity: item.quantity,
              set: item.set,
              setCode: item.setCode,
              collectorNumber: item.collectorNumber,
              rarity: item.rarity,
              language: item.language,
              mtgData: item.mtgData,
              userId: item.userId,
              createdAt: item.createdAt,
            }))}
            onEdit={(card) => {
              const wishlistItem = items.find(i => i.id === card.id);
              if (wishlistItem) {
                handleOpenMenu(wishlistItem);
              }
            }}
            onDelete={removeItem}
            showActions={true}
            gap={24}
            renderCardWrapper={(card, index) => {
              // Trouver l'item correspondant par ID
              const item = filteredItems.find(i => i.id === card.id);
              if (!item) return null;
              
              const inCollection = isCardInCollection(item.name);
              const itemsWithSameName = filteredItems.filter(i => i.name === item.name);
              
              return (
                <div key={item.id} className="relative">
                  {inCollection && (
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 bg-green-500 dark:bg-green-600 text-white text-xs font-medium rounded-full shadow-lg">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Possédée
                    </div>
                  )}
                  {(item.notes || item.targetPrice) && (
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 bg-yellow-500 dark:bg-yellow-600 text-white text-xs font-medium rounded-full shadow-lg">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                  <CardDisplay
                    card={card}
                    allCardsWithSameName={itemsWithSameName.map(i => ({
                      id: i.id,
                      name: i.name,
                      quantity: i.quantity,
                      set: i.set,
                      setCode: i.setCode,
                      collectorNumber: i.collectorNumber,
                      rarity: i.rarity,
                      language: i.language,
                      mtgData: i.mtgData,
                      userId: i.userId,
                      createdAt: i.createdAt,
                    }))}
                    onEdit={(card) => {
                      const wishlistItem = items.find(i => i.id === card.id);
                      if (wishlistItem) {
                        handleOpenMenu(wishlistItem);
                      }
                    }}
                    onDelete={removeItem}
                    showActions={true}
                    showQuantity={true}
                  />
                </div>
              );
            }}
          />
        </div>
      ) : (
        // Grille normale pour les petites wishlists
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {filteredItems.map(item => {
            const inCollection = isCardInCollection(item.name);
            // Grouper les items avec le même nom pour CardDisplay
            const itemsWithSameName = filteredItems.filter(i => i.name === item.name);
            
            return (
              <div key={item.id} className="relative">
                {inCollection && (
                  <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 bg-green-500 dark:bg-green-600 text-white text-xs font-medium rounded-full shadow-lg">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Possédée
                  </div>
                )}
                {(item.notes || item.targetPrice) && (
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 bg-yellow-500 dark:bg-yellow-600 text-white text-xs font-medium rounded-full shadow-lg">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <CardDisplay
                  card={{
                    id: item.id,
                    name: item.name,
                    quantity: item.quantity,
                    set: item.set,
                    setCode: item.setCode,
                    collectorNumber: item.collectorNumber,
                    rarity: item.rarity,
                    language: item.language,
                    mtgData: item.mtgData,
                    userId: item.userId,
                    createdAt: item.createdAt,
                  }}
                  allCardsWithSameName={itemsWithSameName.map(i => ({
                    id: i.id,
                    name: i.name,
                    quantity: i.quantity,
                    set: i.set,
                    setCode: i.setCode,
                    collectorNumber: i.collectorNumber,
                    rarity: i.rarity,
                    language: i.language,
                    mtgData: i.mtgData,
                    userId: i.userId,
                    createdAt: i.createdAt,
                  }))}
                  onEdit={(card) => {
                    const wishlistItem = items.find(i => i.id === card.id);
                    if (wishlistItem) {
                      handleOpenMenu(wishlistItem);
                    }
                  }}
                  onDelete={removeItem}
                  showActions={true}
                  showQuantity={true}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Modal d'export */}
      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Exporter la wishlist"
      >
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Sélectionnez le format d'exportation pour votre wishlist.
          </p>
          <div className="flex gap-4 justify-center">
            <Button
              onClick={() => {
                handleExport('csv');
                setShowExportModal(false);
              }}
              disabled={items.length === 0}
            >
              Exporter en CSV
            </Button>
            <Button
              onClick={() => {
                handleExport('json');
                setShowExportModal(false);
              }}
              disabled={items.length === 0}
            >
              Exporter en JSON
            </Button>
          </div>
          {items.length === 0 && (
            <p className="text-center text-sm text-red-500 dark:text-red-400">
              Votre wishlist est vide, impossible d'exporter.
            </p>
          )}
        </div>
      </Modal>

      {/* Modal de suppression */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Supprimer toute la wishlist"
      >
        <p className="mb-4">
          Êtes-vous sûr de vouloir supprimer tous les items de votre wishlist ?
          Cette action est irréversible.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Annuler
          </Button>
          <Button variant="danger" onClick={handleDeleteAll}>
            Supprimer tout
          </Button>
        </div>
      </Modal>

      {/* Modal de menu pour wishlist */}
      {selectedItemForMenu && (
        <WishlistCardMenuModal
          isOpen={selectedItemForMenu !== null}
          onClose={() => setSelectedItemForMenu(null)}
          item={selectedItemForMenu}
          onUpdate={handleUpdateItem}
          onDelete={handleDelete}
        />
      )}

    </div>
  );
}
