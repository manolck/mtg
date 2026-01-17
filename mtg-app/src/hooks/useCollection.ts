import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, getDocs, addDoc, doc, updateDoc, deleteDoc, writeBatch, getDoc, collectionGroup, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { parseCSV } from '../services/csvParser';
import { searchCardByName, searchCardsByName, searchCardByMultiverseId, searchCardByNameAndNumber } from '../services/mtgApi';
import { searchCardByScryfallId, searchCardBySetAndNumber, searchCardByNameAndNumberScryfall } from '../services/scryfallApi';
import type { MTGCard } from '../types/card';
import type { UserCard } from '../types/card';
import type { ImportReport, CardImportStatus } from '../types/import';
import { useAuth } from './useAuth';
import { useImports } from './useImports';
import type { UserProfile } from '../types/user';
import { LRUCache } from '../utils/LRUCache';

/**
 * Nettoie un objet en retirant tous les champs undefined pour la compatibilité Firestore
 * Firestore n'accepte pas les valeurs undefined
 */
function cleanForFirestore(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => cleanForFirestore(item));
  }
  
  if (typeof obj === 'object' && obj.constructor === Object) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Ne pas inclure les champs undefined
      if (value !== undefined) {
        cleaned[key] = cleanForFirestore(value);
      }
    }
    return cleaned;
  }
  
  return obj;
}

export interface ImportProgress {
  current: number;
  total: number;
  currentCard: string;
  success: number;
  errors: number;
  skipped: number;
  details: Array<{
    cardName: string;
    status: 'success' | 'error' | 'skipped';
    message?: string;
  }>;
}

export function useCollection(userId?: string) {
  const { currentUser } = useAuth();
  const { createImport, updateImportStatus, updateImportProgress, saveImportReport } = useImports();
  const [cards, setCards] = useState<UserCard[]>([]);
  const [allCards, setAllCards] = useState<UserCard[]>([]); // Toutes les cartes chargées
  const [displayedCount, setDisplayedCount] = useState(50); // Nombre de cartes affichées
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:76',message:'useEffect triggered',data:{userId,currentUserId:currentUser?.uid,hasCurrentUser:!!currentUser},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    // Si userId est 'all', charger toutes les collections
    if (userId === 'all') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:79',message:'Loading all collections',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      loadAllCollections();
      setViewingUserId(null);
    } else {
      const targetUserId = userId || currentUser?.uid;
      if (targetUserId) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:84',message:'Loading collection for user',data:{targetUserId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        loadCollection(targetUserId);
        setViewingUserId(targetUserId);
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:87',message:'No user ID, clearing collection',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        setCards([]);
        setLoading(false);
        setViewingUserId(null);
      }
    }
  }, [currentUser, userId]);

  async function loadCollection(targetUserId: string) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:94',message:'loadCollection started',data:{targetUserId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    try {
      setLoading(true);
      setLoadingMore(false);
      const cardsRef = collection(db, 'users', targetUserId, 'collection');
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:101',message:'Before getDocs',data:{targetUserId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Charger toutes les cartes
      const cardsQuery = query(cardsRef);
      const snapshot = await getDocs(cardsQuery);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:103',message:'After getDocs',data:{docCount:snapshot.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      // Utiliser une Map basée sur la clé logique pour dédupliquer
      const cardsByKeyMap = new Map<string, UserCard>();
      const duplicateCardsToDelete: string[] = [];
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const card: UserCard = {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as UserCard;
        
        const cardKey = getCardKey(card);
        
        if (cardsByKeyMap.has(cardKey)) {
          // Doublon détecté : fusionner les quantités
          const existingCard = cardsByKeyMap.get(cardKey)!;
          const mergedQuantity = existingCard.quantity + card.quantity;
          // Garder la carte existante avec la quantité fusionnée
          existingCard.quantity = mergedQuantity;
          // Marquer la carte dupliquée pour suppression
          duplicateCardsToDelete.push(card.id);
        } else {
          cardsByKeyMap.set(cardKey, card);
        }
      });

      // Supprimer les doublons de Firestore en arrière-plan (sans bloquer l'affichage)
      if (duplicateCardsToDelete.length > 0) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:152',message:'Processing duplicate cards',data:{duplicateCount:duplicateCardsToDelete.length,totalCards:cardsByKeyMap.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        // Créer une Map pour trouver rapidement les cartes à mettre à jour
        // On utilise les clés des cartes dupliquées pour identifier les cartes à mettre à jour
        const duplicateKeysMap = new Map<string, string>();
        duplicateCardsToDelete.forEach(duplicateId => {
          const duplicateDoc = snapshot.docs.find(d => d.id === duplicateId);
          if (duplicateDoc) {
            const duplicateData = duplicateDoc.data();
            const duplicateCardKey = getCardKey({
              name: duplicateData.name || '',
              setCode: duplicateData.setCode || duplicateData.set || '',
              collectorNumber: duplicateData.collectorNumber || '',
              language: duplicateData.language || 'en',
            });
            duplicateKeysMap.set(duplicateCardKey, duplicateId);
          }
        });
        
        // Mettre à jour uniquement les cartes qui ont été fusionnées
        const updatePromises = Array.from(cardsByKeyMap.entries())
          .filter(([cardKey, card]) => duplicateKeysMap.has(cardKey))
          .map(([cardKey, card]) => {
            const cardRef = doc(cardsRef, card.id);
            return updateDoc(cardRef, { quantity: card.quantity }).catch(err => {
              console.warn(`Erreur lors de la mise à jour de la quantité pour ${card.id}:`, err);
            });
          });
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:180',message:'After processing duplicates',data:{updatePromisesCount:updatePromises.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        // Supprimer les doublons et mettre à jour les quantités en arrière-plan
        Promise.all([
          ...duplicateCardsToDelete.map(cardId => {
            const cardRef = doc(cardsRef, cardId);
            return deleteDoc(cardRef).catch(err => {
              console.warn(`Erreur lors de la suppression du doublon ${cardId}:`, err);
            });
          }),
          ...updatePromises
        ]).catch(err => {
          console.warn('Erreur lors de la suppression/mise à jour des doublons:', err);
        });
      }

      const allCardsArray = Array.from(cardsByKeyMap.values());
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:161',message:'Before setting cards',data:{allCardsCount:allCardsArray.length,displayedCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      setAllCards(allCardsArray);
      setCards(allCardsArray.slice(0, displayedCount));
      setError(null);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:165',message:'Setting loading to false',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      setLoading(false);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:167',message:'loadCollection completed successfully',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:169',message:'loadCollection error',data:{errorMessage:err instanceof Error ? err.message : String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      console.error('Error loading collection:', err);
      setError('Erreur lors du chargement de la collection');
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function loadAllCollections() {
    try {
      setLoading(true);
      setLoadingMore(false);
      setError(null);

      // OPTIMISATION : Charger d'abord un échantillon de 50 cartes pour un chargement initial rapide
      const INITIAL_BATCH_SIZE = 50;
      const collectionsGroup = collectionGroup(db, 'collection');
      const initialQuery = query(collectionsGroup, limit(INITIAL_BATCH_SIZE));
      const initialSnapshot = await getDocs(initialQuery);
      
      // Grouper par userId pour récupérer les profils (échantillon initial)
      const userMap = new Map<string, { cards: UserCard[]; userId: string }>();
      
      initialSnapshot.forEach((docSnap) => {
        const userId = docSnap.ref.parent.parent?.id;
        if (userId) {
          if (!userMap.has(userId)) {
            userMap.set(userId, { userId, cards: [] });
          }
          
          const data = docSnap.data();
          const card: UserCard = {
            id: docSnap.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            ownerId: userId,
          } as UserCard;
          
          userMap.get(userId)!.cards.push(card);
        }
      });

      // Charger les profils pour chaque utilisateur (avec cache)
      const allCards: UserCard[] = [];
      const profilePromises: Promise<void>[] = [];

      for (const [userId, userData] of userMap) {
        const promise = (async () => {
            try {
            // Vérifier le cache d'abord
            let profile = profileCacheRef.current.get(userId);
            
            if (profile === null) {
              // null signifie soit pas dans le cache, soit expiré
              // Charger le profil depuis Firestore
              const profileRef = doc(db, 'users', userId, 'profile', 'data');
              const profileSnap = await getDoc(profileRef);
              
              if (profileSnap.exists()) {
                const profileData = profileSnap.data();
                profile = {
                  ...profileData,
                  createdAt: profileData.createdAt?.toDate() || new Date(),
                  updatedAt: profileData.updatedAt?.toDate() || new Date(),
                } as UserProfile;
              } else {
                profile = null;
              }
              
              // Mettre à jour le cache
              profileCacheRef.current.set(userId, profile);
            }

            // Ajouter les cartes avec le profil du propriétaire
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
            // Mettre en cache un profil null pour éviter de réessayer immédiatement
            profileCacheRef.current.set(userId, null);
            // Ajouter les cartes sans profil
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

      // Attendre que tous les profils soient chargés
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:268',message:'Before Promise.all for profiles',data:{profilePromisesCount:profilePromises.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      await Promise.all(profilePromises);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:270',message:'After Promise.all for profiles',data:{allCardsCount:allCards.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion

      setAllCards(allCards);
      setCards(allCards.slice(0, displayedCount));
      setError(null);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:275',message:'Setting loading to false in loadAllCollections',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      setLoading(false);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/67215df1-356d-4529-b0a0-c92e4af5fdea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCollection.ts:277',message:'loadAllCollections completed successfully',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion

      // Si on a chargé exactement INITIAL_BATCH_SIZE, il y a probablement plus de cartes
      // Charger le reste en arrière-plan
      if (initialSnapshot.size === INITIAL_BATCH_SIZE) {
        setLoadingMore(true);
        
        // Charger toutes les cartes restantes en arrière-plan
        const remainingQuery = query(collectionsGroup);
        const remainingSnapshot = await getDocs(remainingQuery);
        
        const remainingUserMap = new Map<string, { cards: UserCard[]; userId: string }>();
        remainingSnapshot.forEach((docSnap) => {
          const userId = docSnap.ref.parent.parent?.id;
          if (userId) {
            if (!remainingUserMap.has(userId)) {
              remainingUserMap.set(userId, { userId, cards: [] });
            }
            
            const data = docSnap.data();
            const card: UserCard = {
              id: docSnap.id,
              ...data,
              createdAt: data.createdAt?.toDate() || new Date(),
              ownerId: userId,
            } as UserCard;
            
            remainingUserMap.get(userId)!.cards.push(card);
          }
        });

        // Charger les profils pour les nouvelles cartes
        const remainingAllCards: UserCard[] = [];
        const remainingProfilePromises: Promise<void>[] = [];

        for (const [userId, userData] of remainingUserMap) {
          const promise = (async () => {
            try {
              // Vérifier le cache d'abord
              let profile = profileCacheRef.current.get(userId);
              
              if (profile === null) {
                // null signifie soit pas dans le cache, soit expiré
                const profileRef = doc(db, 'users', userId, 'profile', 'data');
                const profileSnap = await getDoc(profileRef);
                
                if (profileSnap.exists()) {
                  const profileData = profileSnap.data();
                  profile = {
                    ...profileData,
                    createdAt: profileData.createdAt?.toDate() || new Date(),
                    updatedAt: profileData.updatedAt?.toDate() || new Date(),
                  } as UserProfile;
                } else {
                  profile = null;
                }
                
                profileCacheRef.current.set(userId, profile);
              }

              userData.cards.forEach(card => {
                remainingAllCards.push({
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
                remainingAllCards.push({
                  ...card,
                  ownerId: userId,
                });
              });
            }
          })();
          
          remainingProfilePromises.push(promise);
        }

        await Promise.all(remainingProfilePromises);
        
        // Fusionner avec les cartes déjà chargées (éviter les doublons)
        const finalCardsMap = new Map<string, UserCard>();
        allCards.forEach(card => finalCardsMap.set(card.id, card));
        remainingAllCards.forEach(card => {
          if (!finalCardsMap.has(card.id)) {
            finalCardsMap.set(card.id, card);
          }
        });
        
        const finalAllCards = Array.from(finalCardsMap.values());
        setAllCards(finalAllCards);
        setCards(finalAllCards.slice(0, displayedCount));
        setLoadingMore(false);
      }
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
      throw new Error('User not authenticated');
    }

    // Réinitialiser le flag d'annulation et de pause
    importCancelledRef.current = false;
    setIsImportPaused(false);
    importPausedRef.current = false;

    // Déclarer jobId avant le try pour qu'il soit accessible dans le catch
    let jobId: string = importId || '';

    try {
      setError(null);
      const cardsRef = collection(db, 'users', currentUser.uid, 'collection');

      // Créer ou récupérer l'import job
      let startIndex = 0;
      let storedCsvContent: string | undefined = undefined;
      let total: number;
      
      if (!jobId) {
        // Nouvel import : parser le CSV et stocker le contenu
        const parsedCardsForTotal = parseCSV(csvContent);
        total = parsedCardsForTotal.length;
        
        // Générer un hash du CSV pour éviter les doublons
        const csvHash = await hashString(csvContent);
        
        // Nouvel import : stocker le CSV pour permettre la reprise
        jobId = await createImport(updateMode ? 'update' : 'add', csvHash, total, csvContent);
        setCurrentImportId(jobId);
        await updateImportStatus(jobId, 'running', 0);
      } else {
        // Reprendre un import existant
        const importRef = doc(db, 'users', currentUser.uid, 'imports', jobId);
        const importDoc = await getDoc(importRef);
        if (importDoc.exists()) {
          const importData = importDoc.data();
          startIndex = importData.currentIndex || 0;
          total = importData.totalCards || 0;
          storedCsvContent = importData.csvContent; // Récupérer le CSV stocké
          await updateImportStatus(jobId, 'running', startIndex);
        } else {
          throw new Error('Import job introuvable');
        }
        setCurrentImportId(jobId);
      }

      // Si on reprend un import et qu'on a le CSV stocké, l'utiliser
      // Sinon, utiliser le CSV fourni en paramètre
      const csvToUse = storedCsvContent || csvContent;
      const parsedCards = parseCSV(csvToUse);
      
      // Mettre à jour total si nécessaire (pour les nouveaux imports)
      if (!total) {
        total = parsedCards.length;
      }

      // Initialiser le rapport
      const report: ImportReport = {
        success: 0,
        errors: 0,
        skipped: 0,
        updated: 0,
        added: 0,
        removed: 0,
        details: [],
      };

      // Initialiser la progression
      setImportProgress({
        current: startIndex,
        total,
        currentCard: '',
        success: 0,
        errors: 0,
        skipped: 0,
        details: [],
      });

      // Charger la collection existante en mémoire pour vérifier les doublons
      // Maintenant nécessaire aussi en mode "add" pour éviter les doublons
      let existingCardsMap: Map<string, UserCard> = new Map();
      setImportProgress(prev => prev ? {
        ...prev,
        currentCard: 'Chargement de la collection existante...',
      } : null);

      const existingSnapshot = await getDocs(cardsRef);
      existingSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const card: UserCard = {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as UserCard;
        const key = getCardKey(card);
        if (existingCardsMap.has(key)) {
          const existing = existingCardsMap.get(key)!;
          // Si doublon détecté, garder celui avec la plus grande quantité ou le plus récent
          if (card.quantity > existing.quantity || (card.quantity === existing.quantity && card.createdAt > existing.createdAt)) {
            existingCardsMap.set(key, card);
          }
        } else {
          existingCardsMap.set(key, card);
        }
      });

      // Constantes pour l'optimisation
      const PARALLEL_BATCH_SIZE = 8; // Nombre de cartes à traiter en parallèle
      const FIRESTORE_BATCH_SIZE = 500; // Limite Firestore
      const SAVE_PROGRESS_INTERVAL = 5; // Sauvegarder la progression tous les N cartes (réduit pour des mises à jour plus fréquentes)

      // Traiter les cartes par lots parallèles
      const cardsToProcess = parsedCards.slice(startIndex);
      const writeBatchQueue: Array<{ type: 'add' | 'update' | 'delete'; cardId?: string; data?: any }> = [];
      
      for (let i = 0; i < cardsToProcess.length; i += PARALLEL_BATCH_SIZE) {
        // Vérifier si l'import est annulé ou en pause
        if (importCancelledRef.current) {
          await updateImportStatus(jobId, 'cancelled', startIndex + i);
          throw new Error('Import annulé par l\'utilisateur');
        }

        // Attendre si l'import est en pause (utiliser le ref pour avoir la valeur à jour)
        while (importPausedRef.current && !importCancelledRef.current) {
          await updateImportStatus(jobId, 'paused', startIndex + i);
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (importCancelledRef.current) {
          await updateImportStatus(jobId, 'cancelled', startIndex + i);
          throw new Error('Import annulé par l\'utilisateur');
        }

        const batch = cardsToProcess.slice(i, i + PARALLEL_BATCH_SIZE);
        
        // Traiter le lot en parallèle
        const batchResults = await Promise.all(batch.map(async (parsedCard) => {
          try {
            // Vérifier la pause avant chaque carte
            if (importPausedRef.current && !importCancelledRef.current) {
              // Attendre que la pause soit levée
              while (importPausedRef.current && !importCancelledRef.current) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
            
            if (importCancelledRef.current) {
              throw new Error('Import annulé par l\'utilisateur');
            }
            
            const cardLanguage = parsedCard.language || 'en';
            const preferFrench = cardLanguage === 'fr' || cardLanguage === 'French';
            
            // Utiliser la fonction helper pour rechercher la carte
            const cardData = await searchCardData(parsedCard, preferFrench);
            const { mtgData, backMtgData, backImageUrl, backMultiverseid } = cardData;
            
            // Vérifier si la carte existe déjà (maintenant aussi en mode "add" pour éviter les doublons)
            const cardKey = getCardKey({
              name: parsedCard.name,
              setCode: parsedCard.setCode,
              collectorNumber: parsedCard.collectorNumber,
              language: parsedCard.language || 'en',
              set: parsedCard.set
            });
            const existingCard = existingCardsMap.get(cardKey);
            
            if (existingCard) {
              // Carte existante trouvée : mettre à jour ou fusionner selon le mode
              const targetQuantity = parsedCard.quantity || 1;
              
              if (updateMode) {
                // Mode update : comparer et mettre à jour seulement si différent
                const needsUpdate = 
                  existingCard.quantity !== targetQuantity ||
                  existingCard.setCode !== parsedCard.setCode ||
                  existingCard.collectorNumber !== parsedCard.collectorNumber ||
                  existingCard.rarity !== parsedCard.rarity ||
                  existingCard.condition !== parsedCard.condition ||
                  existingCard.language !== parsedCard.language ||
                  !existingCard.mtgData ||
                  (mtgData && JSON.stringify(existingCard.mtgData) !== JSON.stringify(mtgData));
                
                if (needsUpdate) {
                  return {
                    type: 'update' as const,
                    cardId: existingCard.id,
                    data: {
                      quantity: targetQuantity,
                      set: parsedCard.set || parsedCard.setCode || existingCard.set,
                      setCode: parsedCard.setCode || existingCard.setCode,
                      collectorNumber: parsedCard.collectorNumber || existingCard.collectorNumber,
                      rarity: parsedCard.rarity || existingCard.rarity,
                      condition: parsedCard.condition || existingCard.condition,
                      language: parsedCard.language || existingCard.language || 'en',
                      mtgData: mtgData || existingCard.mtgData,
                      backImageUrl: backImageUrl || existingCard.backImageUrl,
                      backMultiverseid: backMultiverseid || existingCard.backMultiverseid,
                      backMtgData: backMtgData || existingCard.backMtgData,
                    },
                    status: 'updated' as CardImportStatus,
                    message: `Mis à jour (quantité: ${existingCard.quantity} → ${targetQuantity})`,
                  };
                } else {
                  return {
                    type: 'skip' as const,
                    status: 'skipped' as CardImportStatus,
                    message: 'Aucun changement',
                  };
                }
              } else {
                // Mode add : fusionner les quantités pour éviter les doublons
                const mergedQuantity = existingCard.quantity + targetQuantity;
                return {
                  type: 'update' as const,
                  cardId: existingCard.id,
                  data: {
                    quantity: mergedQuantity,
                    // Garder les autres champs existants sauf si de nouvelles données sont disponibles
                    mtgData: mtgData || existingCard.mtgData,
                    backImageUrl: backImageUrl || existingCard.backImageUrl,
                    backMultiverseid: backMultiverseid || existingCard.backMultiverseid,
                    backMtgData: backMtgData || existingCard.backMtgData,
                  },
                  status: 'updated' as CardImportStatus,
                  message: `Quantité fusionnée (${existingCard.quantity} + ${targetQuantity} = ${mergedQuantity})`,
                };
              }
            } else {
              // Nouvelle carte à ajouter (pas de doublon trouvé)
              return {
                type: 'add' as const,
                data: {
                  name: parsedCard.name,
                  quantity: parsedCard.quantity || 1,
                  set: parsedCard.set || parsedCard.setCode || mtgData?.set,
                  setCode: parsedCard.setCode,
                  collectorNumber: parsedCard.collectorNumber,
                  rarity: parsedCard.rarity || mtgData?.rarity,
                  condition: parsedCard.condition,
                  language: parsedCard.language || 'en',
                  mtgData: mtgData || null,
                  backImageUrl: backImageUrl || null,
                  backMultiverseid: backMultiverseid || null,
                  backMtgData: backMtgData || null,
                  userId: currentUser.uid,
                  createdAt: new Date(),
                },
                status: 'added' as CardImportStatus,
                message: `Ajoutée (quantité: ${parsedCard.quantity || 1})`,
              };
            }
          } catch (err: any) {
            console.error(`Error processing card ${parsedCard.name}:`, err);
            return {
              type: 'error' as const,
              status: 'error' as CardImportStatus,
              message: err.message || 'Erreur inconnue',
            };
          }
        }));

        // Traiter les résultats du batch
        batchResults.forEach((result, resultIndex) => {
          const currentIndex = startIndex + i + resultIndex;
          const parsedCard = batch[resultIndex];
          
          // Mettre à jour les statistiques dans le rapport
          if (result.type === 'add') {
            writeBatchQueue.push({ type: 'add', data: result.data });
            report.added++;
            report.success++;
          } else if (result.type === 'update') {
            writeBatchQueue.push({ type: 'update', cardId: result.cardId, data: result.data });
            report.updated++;
            report.success++;
          } else if (result.type === 'skip') {
            report.skipped++;
          } else if (result.type === 'error') {
            report.errors++;
          }

          report.details.push({
            cardName: parsedCard.name,
            status: result.status,
            message: result.message,
          });
          
          // Mettre à jour l'état de progression avec les statistiques à jour
          setImportProgress(prev => prev ? {
            ...prev,
            current: currentIndex + 1,
            currentCard: parsedCard.name,
            success: report.success,
            errors: report.errors,
            skipped: report.skipped,
          } : null);
        });

        // Exécuter les écritures Firestore par batch
        if (writeBatchQueue.length >= FIRESTORE_BATCH_SIZE) {
          await executeWriteBatch(writeBatchQueue.splice(0, FIRESTORE_BATCH_SIZE), cardsRef);
        }

        // Sauvegarder la progression périodiquement (tous les SAVE_PROGRESS_INTERVAL cartes)
        const currentProgressIndex = startIndex + i + PARALLEL_BATCH_SIZE;
        const cardsProcessed = i + PARALLEL_BATCH_SIZE;
        const shouldSaveProgress = 
          cardsProcessed % SAVE_PROGRESS_INTERVAL === 0 || 
          cardsProcessed >= cardsToProcess.length;
        
        if (shouldSaveProgress) {
          await updateImportProgress(jobId, currentProgressIndex, {
            success: report.success,
            errors: report.errors,
            skipped: report.skipped,
            updated: report.updated,
            added: report.added,
          });
        }
      }

      // Exécuter les écritures restantes
      if (writeBatchQueue.length > 0) {
        await executeWriteBatch(writeBatchQueue, cardsRef);
      }

      // Pour le mode update, identifier et supprimer les cartes obsolètes
      if (updateMode) {
        const csvCardKeys = new Set(parsedCards.map(card => getCardKey(card)));
        const cardsToRemove: string[] = [];
        
        existingCardsMap.forEach((card, key) => {
          if (!csvCardKeys.has(key)) {
            cardsToRemove.push(card.id);
          }
        });

        if (cardsToRemove.length > 0) {
          // Supprimer par batches
          for (let j = 0; j < cardsToRemove.length; j += FIRESTORE_BATCH_SIZE) {
            const batch = writeBatch(db);
            const batchIds = cardsToRemove.slice(j, j + FIRESTORE_BATCH_SIZE);
            
            batchIds.forEach(cardId => {
              batch.delete(doc(cardsRef, cardId));
            });
            
            await batch.commit();
            report.removed += batchIds.length;
          }
        }
      }

      // Sauvegarder le rapport final
      await saveImportReport(jobId, report);
      await updateImportStatus(jobId, 'completed');

      // Mettre à jour la progression finale
      setImportProgress(prev => prev ? {
        ...prev,
        current: total,
        currentCard: 'Terminé',
      } : null);

      // Garder la progression quelques secondes pour voir le résumé
      setTimeout(() => {
        setImportProgress(null);
        setCurrentImportId(null);
      }, 3000);
    } catch (err) {
      console.error('Error importing CSV:', err);
      setError('Erreur lors de l\'import CSV');
      setImportProgress(null);
      setCurrentImportId(null);
      
      if (jobId) {
        await updateImportStatus(jobId, 'failed', undefined, err instanceof Error ? err.message : 'Erreur inconnue');
      }
      
      throw err;
    }
  }

  // Fonction helper pour exécuter un batch d'écritures Firestore
  async function executeWriteBatch(
    queue: Array<{ type: 'add' | 'update' | 'delete'; cardId?: string; data?: any }>,
    cardsRef: any
  ) {
    if (queue.length === 0) return;

    const batch = writeBatch(db);
    const addsToProcess: any[] = [];
    const localUpdates: UserCard[] = [];

    // Séparer les ajouts des mises à jour/suppressions
    for (const item of queue) {
      if (item.type === 'add' && item.data) {
        addsToProcess.push(item.data);
      } else if (item.type === 'update' && item.cardId && item.data) {
        batch.update(doc(cardsRef, item.cardId), cleanForFirestore(item.data));
        // Mettre à jour localement
        setCards(prev => prev.map(card => 
          card.id === item.cardId 
            ? { ...card, ...item.data }
            : card
        ));
      } else if (item.type === 'delete' && item.cardId) {
        batch.delete(doc(cardsRef, item.cardId));
        setCards(prev => prev.filter(card => card.id !== item.cardId));
      }
    }

    // Traiter les ajouts avec addDoc pour obtenir les IDs réels
    for (const data of addsToProcess) {
      const newCardRef = await addDoc(cardsRef, cleanForFirestore(data));
      localUpdates.push({
        id: newCardRef.id,
        ...data,
        createdAt: data.createdAt || new Date(),
      } as UserCard);
    }

    // Exécuter le batch pour les updates/delete
    // On commit toujours le batch même s'il est vide (Firestore gère cela)
    await batch.commit();

    // Ajouter les nouvelles cartes localement
    if (localUpdates.length > 0) {
      setCards(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        const newCards = localUpdates.filter(c => !existingIds.has(c.id));
        return [...prev, ...newCards];
      });
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
      const cardRef = doc(db, 'users', currentUser!.uid, 'collection', cardId);
      await deleteDoc(cardRef);
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
      const cardsRef = collection(db, 'users', currentUser!.uid, 'collection');
      const snapshot = await getDocs(cardsRef);
      
      // Firestore limite les batches à 500 opérations, mais pour être sûr, utilisons 400
      const BATCH_SIZE = 400;
      const docRefs = snapshot.docs.map(docSnap => docSnap.ref);
      
      // Mettre à jour l'état local immédiatement pour un feedback rapide
      setCards([]);
      
      // Diviser en batches et supprimer progressivement
      for (let i = 0; i < docRefs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const batchRefs = docRefs.slice(i, i + BATCH_SIZE);
        
        batchRefs.forEach((docRef) => {
          batch.delete(docRef);
        });
        
        // Commit chaque batch individuellement
        await batch.commit();
      }
      
      // Ne pas recharger la collection car on a déjà mis à jour l'état local
      // Cela évite une transaction supplémentaire
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
      const cardRef = doc(db, 'users', currentUser!.uid, 'collection', cardId);
      await updateDoc(cardRef, {
        quantity,
      });
      await loadCollection(currentUser!.uid);
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
      const cardRef = doc(db, 'users', currentUser!.uid, 'collection', cardId);
      await updateDoc(cardRef, cleanForFirestore(updates));
      await loadCollection(currentUser!.uid);
    } catch (err) {
      console.error('Error updating card:', err);
      setError('Erreur lors de la mise à jour de la carte');
      throw err;
    }
  }

  // Fonction pour charger plus de cartes au défilement
  const loadMoreCards = useCallback(async () => {
    if (loadingMore || displayedCount >= allCards.length) {
      return;
    }

    setLoadingMore(true);
    
    // Simuler un petit délai pour le chargement
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Afficher 50 cartes supplémentaires
    const newCount = Math.min(displayedCount + 50, allCards.length);
    setDisplayedCount(newCount);
    setCards(allCards.slice(0, newCount));
    
    setLoadingMore(false);
  }, [allCards, displayedCount, loadingMore]);

  // Réinitialiser displayedCount quand allCards change
  useEffect(() => {
    setDisplayedCount(50);
    setCards(allCards.slice(0, 50));
  }, [allCards.length]);

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
    hasMoreCards: allCards.length > displayedCount,
  };
}

