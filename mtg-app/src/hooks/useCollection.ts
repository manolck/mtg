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
  // Cache pour les profils utilisateurs afin d'éviter de les recharger inutilement
  const profileCacheRef = useRef<Map<string, { profile: UserProfile | null; timestamp: number }>>(new Map());
  const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
      const cardsRef = collection(db, 'users', targetUserId, 'collection');
      
      // Charger toutes les cartes
      const cardsQuery = query(cardsRef);
      const snapshot = await getDocs(cardsQuery);
      
      const cardsMap = new Map<string, UserCard>();
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const card: UserCard = {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as UserCard;
        
        if (!cardsMap.has(card.id)) {
          cardsMap.set(card.id, card);
        }
      });

      const allCardsArray = Array.from(cardsMap.values());
      setAllCards(allCardsArray);
      setCards(allCardsArray.slice(0, displayedCount));
      setError(null);
      setLoading(false);
    } catch (err) {
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
      const now = Date.now();

      for (const [userId, userData] of userMap) {
        const promise = (async () => {
          try {
            // Vérifier le cache d'abord
            const cached = profileCacheRef.current.get(userId);
            let profile: UserProfile | null = null;
            
            if (cached && (now - cached.timestamp) < PROFILE_CACHE_TTL) {
              // Utiliser le profil du cache
              profile = cached.profile;
            } else {
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
              }
              
              // Mettre à jour le cache
              profileCacheRef.current.set(userId, {
                profile,
                timestamp: now,
              });
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
            profileCacheRef.current.set(userId, {
              profile: null,
              timestamp: now,
            });
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
      await Promise.all(profilePromises);

      setAllCards(allCards);
      setCards(allCards.slice(0, displayedCount));
      setError(null);
      setLoading(false);

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
        const remainingNow = Date.now();

        for (const [userId, userData] of remainingUserMap) {
          const promise = (async () => {
            try {
              // Vérifier le cache d'abord
              const cached = profileCacheRef.current.get(userId);
              let profile: UserProfile | null = null;
              
              if (cached && (remainingNow - cached.timestamp) < PROFILE_CACHE_TTL) {
                profile = cached.profile;
              } else {
                const profileRef = doc(db, 'users', userId, 'profile', 'data');
                const profileSnap = await getDoc(profileRef);
                
                if (profileSnap.exists()) {
                  const profileData = profileSnap.data();
                  profile = {
                    ...profileData,
                    createdAt: profileData.createdAt?.toDate() || new Date(),
                    updatedAt: profileData.updatedAt?.toDate() || new Date(),
                  } as UserProfile;
                }
                
                profileCacheRef.current.set(userId, {
                  profile,
                  timestamp: remainingNow,
                });
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
              profileCacheRef.current.set(userId, {
                profile: null,
                timestamp: remainingNow,
              });
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
  function getCardKey(card: { name: string; setCode?: string; collectorNumber?: string }): string {
    return `${card.name}|${card.setCode || ''}|${card.collectorNumber || ''}`;
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

      // Charger la collection existante en mémoire pour le mode update
      let existingCardsMap: Map<string, UserCard> = new Map();
      if (updateMode) {
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
          existingCardsMap.set(key, card);
        });
      }

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
            
            // Pour le mode update, vérifier si la carte existe déjà
            const cardKey = getCardKey(parsedCard);
            const existingCard = updateMode ? existingCardsMap.get(cardKey) : null;
            
            if (existingCard) {
              // Mode update : comparer et mettre à jour seulement si différent
              const targetQuantity = parsedCard.quantity || 1;
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
              // Nouvelle carte à ajouter
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

  async function reloadCard(cardId: string) {
    if (!currentUser || !canModify()) {
      throw new Error('Vous ne pouvez pas modifier cette collection');
    }

    try {
      setError(null);
      // Trouver la carte dans la collection
      const card = cards.find(c => c.id === cardId);
      if (!card) {
        throw new Error('Carte non trouvée');
      }

      // Recharger les données depuis l'API
      const cardLanguage = card.language || 'en';
      const preferFrench = cardLanguage === 'fr' || cardLanguage === 'French';
      
      // PRIORITÉ 1 : Si on a un multiverseid, l'utiliser directement
      let mtgData: MTGCard | null = null;
      if (card.mtgData?.multiverseid) {
        // Essayer d'abord en français si préféré
        if (preferFrench) {
          mtgData = await searchCardByMultiverseId(card.mtgData.multiverseid, true);
          // Si pas de version française, essayer en anglais
          if (!mtgData || !mtgData.imageUrl) {
            const englishCard = await searchCardByMultiverseId(card.mtgData.multiverseid, false);
            if (englishCard) {
              mtgData = englishCard;
            }
          }
        } else {
          // Chercher directement en anglais
          mtgData = await searchCardByMultiverseId(card.mtgData.multiverseid, false);
        }
      }
      
      // PRIORITÉ 2 : Si pas de multiverseid ou recherche échouée, chercher par nom
      if (!mtgData) {
        mtgData = await searchCardByName(card.name, preferFrench ? 'French' : undefined);
      }

      if (!mtgData) {
        throw new Error('Carte non trouvée dans l\'API');
      }

      // Si c'est une carte double-face, chercher aussi la face arrière
      let backMtgData: MTGCard | null = null;
      let backImageUrl: string | undefined = undefined;
      let backMultiverseid: number | undefined = undefined;
      
      if (mtgData.layout === 'transform' || card.name.includes(' // ')) {
        const allCards = await searchCardsByName(card.name);
        const backFace = allCards.find(c => 
          !c.manaCost && 
          (c.layout === 'transform' || c.name.includes(' // '))
        );
        
        if (backFace) {
          backMtgData = backFace;
          backImageUrl = backFace.imageUrl;
          backMultiverseid = backFace.multiverseid;
          
          // Si on cherche en français, chercher la version française de la face arrière
          if (preferFrench && backFace.foreignNames) {
            const frenchBackVersion = backFace.foreignNames.find(fn => 
              fn.language === 'French' || fn.language === 'fr'
            );
            if (frenchBackVersion) {
              backImageUrl = frenchBackVersion.imageUrl || backFace.imageUrl;
              backMultiverseid = frenchBackVersion.multiverseid || backFace.multiverseid;
            }
          }
          
          // Si on a un multiverseid pour la face arrière mais pas d'image, rechercher par multiverseid
          if (backMultiverseid && !backImageUrl) {
            // Essayer d'abord en français si préféré
            if (preferFrench) {
              const backByMultiverseId = await searchCardByMultiverseId(backMultiverseid, true);
              if (backByMultiverseId) {
                backImageUrl = backByMultiverseId.imageUrl;
                backMtgData = backByMultiverseId;
              }
              // Si toujours pas d'image, essayer en anglais
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

      // Mettre à jour la carte dans Firestore
      const cardRef = doc(db, 'users', currentUser.uid, 'collection', cardId);
      await updateDoc(cardRef, cleanForFirestore({
        mtgData: mtgData,
        backImageUrl: backImageUrl || null,
        backMultiverseid: backMultiverseid || null,
        backMtgData: backMtgData || null,
      }));

      // Mettre à jour la carte dans le state local immédiatement pour éviter les doublons
      setCards(prev => {
        const updated = prev.map(c => 
          c.id === cardId 
            ? {
                ...c,
                mtgData: mtgData,
                backImageUrl: backImageUrl,
                backMultiverseid: backMultiverseid,
                backMtgData: backMtgData || undefined,
              }
            : c
        );
        // Dédupliquer par ID au cas où
        const uniqueCards = new Map<string, UserCard>();
        updated.forEach(c => {
          if (!uniqueCards.has(c.id)) {
            uniqueCards.set(c.id, c);
          }
        });
        return Array.from(uniqueCards.values());
      });

      // Recharger la collection pour s'assurer de la synchronisation
      await loadCollection(currentUser.uid);
    } catch (err) {
      console.error('Error reloading card:', err);
      setError('Erreur lors du rechargement de la carte');
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
    loading,
    loadingMore,
    error,
    importCSV,
    deleteCard,
    deleteAllCards,
    updateCardQuantity,
    updateCard,
    reloadCard,
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

