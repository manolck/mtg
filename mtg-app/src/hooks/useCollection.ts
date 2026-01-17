import { useState, useEffect, useRef, useCallback } from 'react';
// Remplacer ces imports Firebase
// import { collection, query, getDocs, ... } from 'firebase/firestore';
// import { db } from '../services/firebase';

// Par ces imports PocketBase
import { pb } from '../services/pocketbase';
import * as collectionService from '../services/collectionService';
import * as importService from '../services/importService';
import { parseCSV } from '../services/csvParser';
import { searchCardByName, searchCardsByName, searchCardByMultiverseId, searchCardByNameAndNumber } from '../services/mtgApi';
import { searchCardByScryfallId, searchCardBySetAndNumber, searchCardByNameAndNumberScryfall } from '../services/scryfallApi';
import type { MTGCard } from '../types/card';
import type { UserCard } from '../types/card';
import type { CardImportStatus } from '../types/import';
import { useAuth } from './useAuth';
// useImports n'est plus nécessaire car on utilise directement importService
import type { UserProfile } from '../types/user';
import { LRUCache } from '../utils/LRUCache';


export interface ImportProgress {
  current: number;
  total: number;
  currentCard: string;
  success: number;
  errors: number;
  skipped: number;
  details: Array<{
    cardName: string;
    status: CardImportStatus;
    message?: string;
  }>;
}

export function useCollection(userId?: string) {
  const { currentUser } = useAuth();
  // Note: Les imports sont maintenant gérés directement via importService dans importCSV
  const [cards, setCards] = useState<UserCard[]>([]);
  const [allCards, setAllCards] = useState<UserCard[]>([]); // Toutes les cartes chargées
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreCards, setHasMoreCards] = useState(true);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [isImportPaused, setIsImportPaused] = useState(false);
  const [currentImportId, setCurrentImportId] = useState<string | null>(null);
  const importCancelledRef = useRef(false);
  const importPausedRef = useRef(false);
  // Cache LRU pour les profils utilisateurs (limite de 100 entrées, TTL de 5 minutes)
  const profileCacheRef = useRef<LRUCache<string, UserProfile | null>>(
    new LRUCache<string, UserProfile | null>(100, 5 * 60 * 1000)
  );

  useEffect(() => {
    // Si userId est 'all', charger toutes les collections
    if (userId === 'all') {
      loadAllCollections();
      setViewingUserId(null);
    } else {
      const targetUserId = userId || currentUser?.uid;
      if (targetUserId) {
        loadCollection(targetUserId);
        setViewingUserId(targetUserId);
      } else {
        setCards([]);
        setLoading(false);
        setViewingUserId(null);
      }
    }
  }, [currentUser, userId]);

  async function loadCollection(targetUserId: string) {
    try {
      setLoading(true);
      setLoadingMore(false);
      setError(null);
  
      // Utiliser le service PocketBase
      const cards = await collectionService.getCollection(targetUserId);
  
      // Gérer les doublons (même logique qu'avant)
      const cardsByKeyMap = new Map<string, UserCard>();
      const duplicateCardsToDelete: string[] = [];
  
      cards.forEach((card) => {
        const cardKey = getCardKey(card);
        
        if (cardsByKeyMap.has(cardKey)) {
          const existingCard = cardsByKeyMap.get(cardKey)!;
          const mergedQuantity = existingCard.quantity + card.quantity;
          existingCard.quantity = mergedQuantity;
          duplicateCardsToDelete.push(card.id);
        } else {
          cardsByKeyMap.set(cardKey, card);
        }
      });
  
      // Supprimer les doublons en arrière-plan
      if (duplicateCardsToDelete.length > 0) {
        // Mettre à jour les quantités fusionnées
        const cardsToUpdate = Array.from(cardsByKeyMap.values())
          .filter(card => duplicateCardsToDelete.some(id => {
            const duplicate = cards.find(c => c.id === id);
            return duplicate && getCardKey(duplicate) === getCardKey(card);
          }));
  
        // Supprimer les doublons
        await collectionService.deleteCards(duplicateCardsToDelete);
  
        // Mettre à jour les quantités
        await Promise.all(
          cardsToUpdate.map(card => 
            collectionService.updateCardQuantity(card.id, card.quantity)
          )
        );
      }
  
      const allCardsArray = Array.from(cardsByKeyMap.values());
      setAllCards(allCardsArray);
      setCards(allCardsArray);
      setHasMoreCards(false);
      setError(null);
      setLoading(false);
    } catch (err) {
      console.error('Error loading collection:', err);
      setError('Erreur lors du chargement de la collection');
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function loadAllCollections(loadMore: boolean = false) {
    try {
      if (!loadMore) {
        setLoading(true);
        setAllCards([]);
        setCurrentPage(1);
        setHasMoreCards(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      // Calculer la page à charger
      const pageToLoad = loadMore ? (currentPage + 1) : 1;
      const BATCH_SIZE = 50;
  
      // Récupérer les cartes via PocketBase
      const result = await collectionService.getAllCollections(pageToLoad, BATCH_SIZE);
  
      // Grouper par userId pour récupérer les profils
      const userMap = new Map<string, { cards: UserCard[]; userId: string }>();
      
      result.items.forEach((card) => {
        const userId = card.userId;
        if (userId) {
          if (!userMap.has(userId)) {
            userMap.set(userId, { userId, cards: [] });
          }
          userMap.get(userId)!.cards.push({
            ...card,
            ownerId: userId,
          });
        }
      });
  
      // Charger les profils (même logique qu'avant avec cache)
      const allCards: UserCard[] = [];
      const profilePromises: Promise<void>[] = [];
  
      for (const [userId, userData] of userMap) {
        const promise = (async () => {
          try {
            let profile = profileCacheRef.current.get(userId);
            
            if (profile === null) {
              // Charger le profil depuis PocketBase
              const profileRecord = await pb.collection('users').getOne(userId, {
                expand: 'profile',
              });
              
              if (profileRecord) {
                profile = {
                  uid: profileRecord.id,
                  email: profileRecord.email,
                  pseudonym: profileRecord.pseudonym,
                  avatarId: profileRecord.avatarId || 'default',
                  role: profileRecord.role || 'user',
                  preferredLanguage: profileRecord.preferredLanguage || 'en',
                  createdAt: new Date(profileRecord.created),
                  updatedAt: new Date(profileRecord.updated),
                } as UserProfile;
              } else {
                profile = null;
              }
              
              profileCacheRef.current.set(userId, profile);
            }
  
            userData.cards.forEach(card => {
              allCards.push({
                ...card,
                ownerId: userId,
                ownerProfile: profile ? {
                  avatarId: profile.avatarId,
                  pseudonym: profile.pseudonym,
                } : undefined,
              });
            });
          } catch (err) {
            console.warn(`Error loading profile for user ${userId}:`, err);
            profileCacheRef.current.set(userId, null);
            userData.cards.forEach(card => {
              allCards.push({
                ...card,
                ownerId: userId,
              });
            });
          }
        })();
        
        profilePromises.push(promise);
      }
  
      await Promise.all(profilePromises);
  
      // Mettre à jour les cartes
      if (loadMore) {
        setAllCards(prev => {
          const existingIds = new Set(prev.map(c => c.id));
          const uniqueNewCards = allCards.filter(c => !existingIds.has(c.id));
          const updated = uniqueNewCards.length > 0 ? [...prev, ...uniqueNewCards] : prev;
          setCards(updated);
          return updated;
        });
      } else {
        setAllCards(allCards);
        setCards(allCards);
      }
  
      // Mettre à jour le statut de pagination
      setCurrentPage(result.page);
      setHasMoreCards(result.page < result.totalPages);
      setError(null);
      setLoading(false);
      setLoadingMore(false);
    } catch (err) {
      console.error('Error loading all collections:', err);
      setError('Erreur lors du chargement de toutes les collections');
      setLoading(false);
      setLoadingMore(false);
    }
  }

  // Fonction helper pour rechercher une carte avec toutes les priorités
  async function searchCardData(parsedCard: any, preferFrench: boolean): Promise<{
    mtgData: MTGCard | null;
    backMtgData: MTGCard | null;
    backImageUrl: string | undefined;
    backMultiverseid: number | undefined;
  }> {
    let mtgData: MTGCard | null = null;
    
    // PRIORITÉ 1 : Recherche par Scryfall ID
    if (parsedCard.scryfallId) {
      try {
        mtgData = await searchCardByScryfallId(parsedCard.scryfallId, preferFrench);
      } catch (error) {
        console.warn('Erreur lors de la recherche par Scryfall ID:', error);
      }
    }
    
    // PRIORITÉ 2 : Recherche par set code + numéro de collection
    if (!mtgData && parsedCard.collectorNumber && (parsedCard.setCode || parsedCard.set)) {
      try {
        mtgData = await searchCardBySetAndNumber(
          parsedCard.setCode || parsedCard.set || '',
          parsedCard.collectorNumber,
          preferFrench
        );
      } catch (error) {
        console.warn('Erreur lors de la recherche Scryfall par set+numéro:', error);
      }
    }
    
    // PRIORITÉ 3 : Recherche par nom + numéro + set via Scryfall
    if (!mtgData && parsedCard.collectorNumber) {
      try {
        mtgData = await searchCardByNameAndNumberScryfall(
          parsedCard.name,
          parsedCard.collectorNumber,
          parsedCard.setCode || parsedCard.set,
          preferFrench
        );
      } catch (error) {
        console.warn('Erreur lors de la recherche Scryfall par nom+numéro:', error);
      }
    }
    
    // PRIORITÉ 4 : Recherche par nom + numéro + set via MTG API
    if (!mtgData && parsedCard.collectorNumber) {
      mtgData = await searchCardByNameAndNumber(
        parsedCard.name,
        parsedCard.collectorNumber,
        parsedCard.setCode || parsedCard.set,
        preferFrench
      );
    }
    
    // PRIORITÉ 5 : Recherche par multiverseid
    if (!mtgData && parsedCard.multiverseid) {
      if (preferFrench) {
        mtgData = await searchCardByMultiverseId(parsedCard.multiverseid, true);
        if (!mtgData || !mtgData.imageUrl) {
          const englishCard = await searchCardByMultiverseId(parsedCard.multiverseid, false);
          if (englishCard) {
            mtgData = englishCard;
          }
        }
      } else {
        mtgData = await searchCardByMultiverseId(parsedCard.multiverseid, false);
      }
    }
    
    // PRIORITÉ 6 : Recherche par nom
    if (!mtgData) {
      if (parsedCard.name.includes(' // ')) {
        const allCards = await searchCardsByName(parsedCard.name);
        const frontFace = allCards.find(c => c.manaCost !== undefined && c.manaCost !== null);
        
        if (frontFace) {
          mtgData = frontFace;
          if (preferFrench && frontFace.foreignNames) {
            const frenchVersion = frontFace.foreignNames.find(fn => 
              fn.language === 'French' || fn.language === 'fr'
            );
            if (frenchVersion) {
              mtgData = {
                ...frontFace,
                name: frenchVersion.name || frontFace.name,
                imageUrl: frenchVersion.imageUrl || frontFace.imageUrl,
                multiverseid: frenchVersion.multiverseid || frontFace.multiverseid,
                text: frenchVersion.text || frontFace.text,
                type: frenchVersion.type || frontFace.type,
              };
            }
          }
        } else {
          mtgData = await searchCardByName(parsedCard.name, preferFrench ? 'French' : undefined);
        }
      } else {
        mtgData = await searchCardByName(parsedCard.name, preferFrench ? 'French' : undefined);
      }
      
      if (mtgData?.multiverseid && !mtgData.imageUrl) {
        const cardByMultiverseId = await searchCardByMultiverseId(mtgData.multiverseid, preferFrench);
        if (cardByMultiverseId) {
          mtgData.imageUrl = cardByMultiverseId.imageUrl || mtgData.imageUrl;
          if (!mtgData.imageUrl && preferFrench) {
            const englishCard = await searchCardByMultiverseId(mtgData.multiverseid, false);
            if (englishCard?.imageUrl) {
              mtgData.imageUrl = englishCard.imageUrl;
            }
          }
        }
      }
    }

    // Recherche de la face arrière pour les cartes double-face
    let backMtgData: MTGCard | null = null;
    let backImageUrl: string | undefined = undefined;
    let backMultiverseid: number | undefined = undefined;
    
    if (mtgData?.layout === 'transform' || parsedCard.name.includes(' // ')) {
      const allCards = await searchCardsByName(parsedCard.name);
      
      let frontFace = allCards.find(c => 
        c.manaCost !== undefined && 
        c.manaCost !== null &&
        c.imageUrl && 
        c.multiverseid
      );
      if (!frontFace) {
        frontFace = allCards.find(c => c.manaCost !== undefined && c.manaCost !== null);
      }
      
      let backFace = allCards.find(c => 
        !c.manaCost && 
        (c.layout === 'transform' || c.name.includes(' // ')) &&
        c.imageUrl && 
        c.multiverseid
      );
      if (!backFace) {
        backFace = allCards.find(c => !c.manaCost && (c.layout === 'transform' || c.name.includes(' // ')));
      }
      
      if (frontFace?.multiverseid && (!backFace?.imageUrl || !backFace?.multiverseid)) {
        const frontMultiverseid = frontFace.multiverseid;
        const potentialBackFace = allCards.find(c => 
          !c.manaCost && 
          c.multiverseid && 
          c.imageUrl &&
          (c.multiverseid === frontMultiverseid + 1 || 
           c.multiverseid === frontMultiverseid - 1 ||
           (c.layout === 'transform' || c.name.includes(' // ')))
        );
        if (potentialBackFace) {
          backFace = potentialBackFace;
        }
      }
      
      if (backFace) {
        backMtgData = backFace;
        backImageUrl = backFace.imageUrl;
        backMultiverseid = backFace.multiverseid;
        
        if (!backImageUrl && backMultiverseid) {
          const cardWithImage = allCards.find(c => 
            c.multiverseid === backMultiverseid && 
            c.imageUrl && 
            !c.manaCost
          );
          if (cardWithImage) {
            backImageUrl = cardWithImage.imageUrl;
            backMtgData = cardWithImage;
          }
        }
        
        if (preferFrench && backFace.foreignNames) {
          const frenchBackVersion = backFace.foreignNames.find(fn => 
            fn.language === 'French' || fn.language === 'fr'
          );
          if (frenchBackVersion) {
            backImageUrl = frenchBackVersion.imageUrl || backFace.imageUrl;
            backMultiverseid = frenchBackVersion.multiverseid || backFace.multiverseid;
          }
        }
        
        if (backMultiverseid && !backImageUrl) {
          if (preferFrench) {
            const backByMultiverseId = await searchCardByMultiverseId(backMultiverseid, true);
            if (backByMultiverseId) {
              backImageUrl = backByMultiverseId.imageUrl;
              backMtgData = backByMultiverseId;
            }
            if (!backImageUrl) {
              const englishBack = await searchCardByMultiverseId(backMultiverseid, false);
              if (englishBack) {
                backImageUrl = englishBack.imageUrl;
                backMtgData = englishBack;
              }
            }
          } else {
            const backByMultiverseId = await searchCardByMultiverseId(backMultiverseid, false);
            if (backByMultiverseId) {
              backImageUrl = backByMultiverseId.imageUrl;
              backMtgData = backByMultiverseId;
            }
          }
        }
      }
    }

    return { mtgData, backMtgData, backImageUrl, backMultiverseid };
  }

  // Fonction pour générer une clé unique pour une carte
  // Inclut la langue pour éviter les doublons entre cartes de langues différentes
  function getCardKey(card: { name: string; setCode?: string; collectorNumber?: string; language?: string; set?: string }): string {
    // Normaliser le nom (trim, lowercase) pour éviter les variations
    const normalizedName = (card.name || '').trim().toLowerCase();
    // Utiliser setCode en priorité, sinon set, sinon chaîne vide
    const setCode = (card.setCode || card.set || '').toLowerCase();
    const collectorNumber = (card.collectorNumber || '').trim();
    // Inclure la langue dans la clé (par défaut 'en' si non spécifiée)
    const language = (card.language || 'en').toLowerCase();
    const key = `${normalizedName}|${setCode}|${collectorNumber}|${language}`;
    return key;
  }

  // Fonction simple pour générer un hash d'une chaîne
  async function hashString(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Fonction pour mettre en pause l'import
  function pauseImport() {
    setIsImportPaused(true);
    importPausedRef.current = true;
  }

  // Fonction pour reprendre l'import
  function resumeImport() {
    setIsImportPaused(false);
    importPausedRef.current = false;
  }

  // Fonction pour annuler l'import
  function cancelImport() {
    importCancelledRef.current = true;
    setIsImportPaused(false);
    importPausedRef.current = false;
  }

  async function importCSV(csvContent: string, updateMode: boolean = false, importId?: string) {
    if (!currentUser) {
      throw new Error('Vous devez être connecté pour importer des cartes');
    }
  
    try {
      // Créer l'import job
      let actualImportId = importId;
      if (!actualImportId) {
        // Calculer le hash du CSV pour identifier les doublons
        const csvHash = await hashString(csvContent);
        actualImportId = await importService.createImport(
          currentUser.uid,
          updateMode ? 'update' : 'add',
          csvHash,
          parseCSV(csvContent).length,
          csvContent
        );
        setCurrentImportId(actualImportId);
      }

      // Mettre à jour le statut
      await importService.updateImportStatus(actualImportId, 'running');
  
      // Parser le CSV
      const parsedCards = parseCSV(csvContent);
      
      // Initialiser la progression
      const progress: ImportProgress = {
        current: 0,
        total: parsedCards.length,
        currentCard: '',
        success: 0,
        errors: 0,
        skipped: 0,
        details: [],
      };
      setImportProgress(progress);
  
      // Traiter les cartes par lots
      const PARALLEL_BATCH_SIZE = 5;
      const cardsToProcess = [...parsedCards];
  
      for (let i = 0; i < cardsToProcess.length; i += PARALLEL_BATCH_SIZE) {
        if (importCancelledRef.current) {
          await importService.updateImportStatus(actualImportId, 'cancelled');
          break;
        }

        if (importPausedRef.current) {
          await importService.updateImportStatus(actualImportId, 'paused');
          // Attendre la reprise
          while (importPausedRef.current && !importCancelledRef.current) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          if (importCancelledRef.current) break;
          await importService.updateImportStatus(actualImportId, 'running');
        }
  
        const batch = cardsToProcess.slice(i, i + PARALLEL_BATCH_SIZE);
        
        const batchResults = await Promise.all(batch.map(async (parsedCard) => {
          try {
            progress.current++;
            progress.currentCard = parsedCard.name;
            setImportProgress({ ...progress });
  
            // Rechercher les données MTG
            const cardData = await searchCardData(parsedCard, false);
  
            // Vérifier si la carte existe déjà
            const existingCard = await collectionService.findCard(currentUser.uid, {
              name: parsedCard.name,
              setCode: parsedCard.setCode,
              collectorNumber: parsedCard.collectorNumber,
              language: parsedCard.language || 'en',
            });
  
            if (existingCard && updateMode) {
              // Mettre à jour la quantité
              const newQuantity = existingCard.quantity + (parsedCard.quantity || 1);
              await collectionService.updateCardQuantity(existingCard.id, newQuantity);
              progress.success++;
              return {
                type: 'update' as const,
                status: 'success' as CardImportStatus,
                message: `Quantité mise à jour: ${existingCard.quantity} → ${newQuantity}`,
              };
            } else if (!existingCard) {
              // Créer une nouvelle carte
              await collectionService.addCard({
                userId: currentUser.uid,
                name: parsedCard.name,
                quantity: parsedCard.quantity || 1,
                set: parsedCard.set || parsedCard.setCode || cardData.mtgData?.set,
                setCode: parsedCard.setCode,
                collectorNumber: parsedCard.collectorNumber,
                rarity: parsedCard.rarity || cardData.mtgData?.rarity,
                condition: parsedCard.condition,
                language: parsedCard.language || 'en',
                mtgData: cardData.mtgData || undefined,
                backImageUrl: cardData.backImageUrl,
                backMultiverseid: cardData.backMultiverseid,
                backMtgData: cardData.backMtgData || undefined,
              });
              progress.success++;
              return {
                type: 'add' as const,
                status: 'success' as CardImportStatus,
                message: `Ajoutée (quantité: ${parsedCard.quantity || 1})`,
              };
            } else {
              progress.skipped++;
              return {
                type: 'skip' as const,
                status: 'skipped' as CardImportStatus,
                message: 'Déjà présente',
              };
            }
          } catch (err: any) {
            progress.errors++;
            return {
              type: 'error' as const,
              status: 'error' as CardImportStatus,
              message: err.message || 'Erreur inconnue',
            };
          }
        }));
  
        // Ajouter les détails
        batchResults.forEach((result, index) => {
          progress.details.push({
            cardName: batch[index].name,
            status: result.status,
            message: result.message,
          });
        });
  
        setImportProgress({ ...progress });
        
        // Mettre à jour la progression dans PocketBase
        await importService.updateImportProgress(
          actualImportId,
          {
            current: progress.current,
            total: progress.total,
            currentCard: progress.currentCard,
            success: progress.success,
            errors: progress.errors,
            skipped: progress.skipped,
            details: progress.details,
          },
          {
            success: progress.success,
            errors: progress.errors,
            skipped: progress.skipped,
            updated: 0,
            added: progress.success,
            removed: 0,
            details: progress.details,
          }
        );
  
        // Délai entre les lots
        await new Promise(resolve => setTimeout(resolve, 100));
      }
  
      // Finaliser l'import
      const finalStatus = importCancelledRef.current ? 'cancelled' : 'completed';
      if (finalStatus === 'completed') {
        await importService.saveImportReport(actualImportId, {
          success: progress.success,
          errors: progress.errors,
          skipped: progress.skipped,
          updated: 0,
          added: progress.success,
          removed: 0,
          details: progress.details,
        });
      } else {
        await importService.updateImportStatus(actualImportId, finalStatus);
      }

      // Recharger la collection
      const targetUserId = userId || currentUser.uid;
      if (targetUserId && targetUserId !== 'all') {
        await loadCollection(targetUserId);
      }
  
      setImportProgress(null);
    } catch (err: any) {
      console.error('Error importing CSV:', err);
      if (currentImportId) {
        await importService.updateImportStatus(currentImportId, 'failed', undefined, err.message);
      }
      throw err;
    }
  }

  // Vérifier si on peut modifier cette collection
  const canModify = () => {
    return currentUser && viewingUserId === currentUser.uid;
  };

  async function deleteCard(cardId: string) {
    if (!canModify()) {
      throw new Error('Vous ne pouvez pas modifier cette collection');
    }

    try {
      await collectionService.deleteCard(cardId);
      await loadCollection(currentUser!.uid);
    } catch (err) {
      console.error('Error deleting card:', err);
      setError('Erreur lors de la suppression de la carte');
      throw err;
    }
  }

  async function deleteAllCards() {
    if (!canModify()) {
      throw new Error('Vous ne pouvez pas modifier cette collection');
    }

    try {
      const cards = await collectionService.getCollection(currentUser!.uid);
      const cardIds = cards.map(c => c.id);
      
      // Mettre à jour l'état local immédiatement pour un feedback rapide
      setCards([]);
      
      // Supprimer toutes les cartes en parallèle
      await collectionService.deleteCards(cardIds);
    } catch (err) {
      console.error('Error deleting all cards:', err);
      setError('Erreur lors de la suppression de la collection');
      // Recharger la collection en cas d'erreur pour récupérer l'état actuel
      await loadCollection(currentUser!.uid);
      throw err;
    }
  }

  async function updateCardQuantity(cardId: string, quantity: number) {
    if (!canModify() || quantity < 1) {
      throw new Error('Vous ne pouvez pas modifier cette collection');
    }

    try {
      await collectionService.updateCardQuantity(cardId, quantity);
      // Mettre à jour l'état local
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, quantity } : c));
      setAllCards(prev => prev.map(c => c.id === cardId ? { ...c, quantity } : c));
    } catch (err) {
      console.error('Error updating card quantity:', err);
      setError('Erreur lors de la mise à jour de la quantité');
      throw err;
    }
  }

  async function updateCard(cardId: string, updates: Partial<UserCard>) {
    if (!canModify()) {
      throw new Error('Vous ne pouvez pas modifier cette collection');
    }

    try {
      await collectionService.updateCard(cardId, updates);
      // Recharger la collection pour avoir les données à jour
      await loadCollection(currentUser!.uid);
    } catch (err) {
      console.error('Error updating card:', err);
      setError('Erreur lors de la mise à jour de la carte');
      throw err;
    }
  }

  // Fonction pour charger plus de cartes au défilement
  const loadMoreCards = useCallback(async () => {
    if (loadingMore || !hasMoreCards) {
      return;
    }
    await loadAllCollections(true);
  }, [loadingMore, hasMoreCards]);

  return {
    cards,
    allCards, // Exposer toutes les cartes pour la recherche
    loading,
    loadingMore,
    error,
    importCSV,
    deleteCard,
    deleteAllCards,
    updateCardQuantity,
    updateCard,
    refresh: () => viewingUserId ? loadCollection(viewingUserId) : Promise.resolve(),
    importProgress,
    canModify: canModify(),
    viewingUserId,
    pauseImport,
    resumeImport,
    cancelImport,
    isImportPaused,
    currentImportId,
    loadMoreCards,
    hasMoreCards,
  };
}

