import type { MTGCard } from '../types/card';

const API_BASE_URL = 'https://api.magicthegathering.io/v1/cards';

const CACHE_DURATION = 1000 * 60 * 60; // 1 heure

interface CacheEntry {
  data: MTGCard[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function getCachedCard(name: string): MTGCard[] | null {
  const entry = cache.get(name.toLowerCase());
  if (entry && Date.now() - entry.timestamp < CACHE_DURATION) {
    return entry.data;
  }
  return null;
}

function setCachedCard(name: string, data: MTGCard[]): void {
  cache.set(name.toLowerCase(), {
    data,
    timestamp: Date.now(),
  });
}

export async function searchCardByName(name: string, language?: string): Promise<MTGCard | null> {
  const cacheKey = `${name.toLowerCase()}_${language || 'default'}`;
  
  // Vérifier le cache
  const cached = getCachedCard(cacheKey);
  if (cached && cached.length > 0) {
    return cached[0];
  }

  try {
    // Pour les cartes double-face, extraire le premier nom (avant " // ")
    // L'API recommande d'utiliser seulement le nom d'un côté pour les cartes double-face
    let searchName = name;
    if (name.includes(' // ')) {
      searchName = name.split(' // ')[0].trim();
    }
    
    // Rechercher toutes les versions de la carte
    const url = `${API_BASE_URL}?name=${encodeURIComponent(searchName)}&pageSize=100`;
    
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    let cards: MTGCard[] = data.cards || [];

    if (cards.length === 0) {
      return null;
    }

    // Filtrer pour ne garder que les cartes qui correspondent au nom complet
    // (pour les cartes double-face, toutes les faces ont le même nom complet)
    if (name.includes(' // ')) {
      cards = cards.filter(c => c.name === name || c.name.includes(' // '));
    }

    // Détecter si c'est une carte double-face (layout === "transform")
    const isDoubleFaced = cards.some(c => c.layout === 'transform' || c.name.includes(' // '));
    
    if (isDoubleFaced) {
      // Séparer les faces avant et arrière
      // Face avant : a un manaCost
      // Face arrière : pas de manaCost
      const frontFace = cards.find(c => c.manaCost !== undefined && c.manaCost !== null);
      const backFace = cards.find(c => !c.manaCost || c.manaCost === null);
      
      if (frontFace && backFace) {
        // Pour les cartes françaises, chercher dans foreignNames
        if (language === 'French') {
          for (const card of cards) {
            if (card.foreignNames) {
              const frenchVersion = card.foreignNames.find(fn => 
                fn.language === 'French' || fn.language === 'fr'
              );
              
              if (frenchVersion) {
                // Déterminer si c'est la face avant ou arrière
                const isFront = card.manaCost !== undefined && card.manaCost !== null;
                const frenchCard: MTGCard = {
                  ...card,
                  name: frenchVersion.name || card.name,
                  imageUrl: frenchVersion.imageUrl || card.imageUrl,
                  multiverseid: frenchVersion.multiverseid || card.multiverseid,
                  text: frenchVersion.text || card.text,
                  type: frenchVersion.type || card.type,
                };
                
                setCachedCard(cacheKey, [frenchCard]);
                return frenchCard;
              }
            }
          }
        }
        
        // Retourner la face avant (celle avec manaCost)
        setCachedCard(cacheKey, [frontFace]);
        return frontFace;
      }
    }

    // Si on cherche une carte française, chercher dans foreignNames
    if (language === 'French') {
      // Parcourir toutes les cartes pour trouver une version française
      for (const card of cards) {
        if (card.foreignNames) {
          const frenchVersion = card.foreignNames.find(fn => 
            fn.language === 'French' || fn.language === 'fr'
          );
          
          if (frenchVersion) {
            // Créer une carte avec les données françaises
            const frenchCard: MTGCard = {
              ...card,
              name: frenchVersion.name || card.name,
              imageUrl: frenchVersion.imageUrl || card.imageUrl, // Utiliser l'imageUrl française !
              multiverseid: frenchVersion.multiverseid || card.multiverseid,
              // Si la version française a d'autres données, les utiliser
              text: frenchVersion.text || card.text,
              type: frenchVersion.type || card.type,
            };
            
            setCachedCard(cacheKey, [frenchCard]);
            return frenchCard;
          }
        }
      }
      
      // Si aucune version française trouvée, retourner la première carte (fallback)
    }

    // Mettre en cache
    setCachedCard(cacheKey, cards);

    // Retourner la première carte trouvée
    return cards[0];
  } catch (error) {
    console.error('Error searching card:', error);
    throw error;
  }
}

export async function searchCardByNameAndNumber(
  name: string,
  collectorNumber: string,
  setCode?: string,
  preferFrench: boolean = true
): Promise<MTGCard | null> {
  const cacheKey = `name_${name.toLowerCase()}_num_${collectorNumber}_set_${setCode || 'any'}_${preferFrench ? 'fr' : 'en'}`;
  
  // Vérifier le cache
  const cached = getCachedCard(cacheKey);
  if (cached && cached.length > 0) {
    return cached[0];
  }

  try {
    // Pour les cartes double-face, extraire le premier nom (avant " // ")
    let searchName = name;
    if (name.includes(' // ')) {
      searchName = name.split(' // ')[0].trim();
    }

    // Construire l'URL avec les paramètres combinés
    const params = new URLSearchParams();
    params.append('name', searchName);
    params.append('number', collectorNumber);
    if (setCode) {
      params.append('set', setCode);
    }
    
    const url = `${API_BASE_URL}?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    let cards: MTGCard[] = data.cards || [];

    if (cards.length === 0) {
      return null;
    }

    // Filtrer pour ne garder que les cartes qui correspondent au nom complet
    // (pour les cartes double-face, toutes les faces ont le même nom complet)
    if (name.includes(' // ')) {
      cards = cards.filter(c => c.name === name || c.name.includes(' // '));
    }

    // Pour les cartes double-face, prendre la face avant (celle avec manaCost)
    let card = cards[0];
    if (name.includes(' // ')) {
      const frontFace = cards.find(c => c.manaCost !== undefined && c.manaCost !== null);
      if (frontFace) {
        card = frontFace;
      }
    }
    
    // Si on préfère le français, chercher dans foreignNames
    if (preferFrench && card.foreignNames) {
      const frenchVersion = card.foreignNames.find(fn => 
        fn.language === 'French' || fn.language === 'fr'
      );
      
      if (frenchVersion) {
        // Créer une carte avec les données françaises
        card = {
          ...card,
          name: frenchVersion.name || card.name,
          imageUrl: frenchVersion.imageUrl || card.imageUrl,
          multiverseid: frenchVersion.multiverseid || card.multiverseid,
          text: frenchVersion.text || card.text,
          type: frenchVersion.type || card.type,
        };
      }
    }
    
    // Mettre en cache
    setCachedCard(cacheKey, [card]);
    return card;
  } catch (error) {
    console.error('Error searching card by name and number:', error);
    throw error;
  }
}

export async function searchCardByMultiverseId(multiverseid: number, preferFrench: boolean = true): Promise<MTGCard | null> {
  const cacheKey = `multiverseid_${multiverseid}_${preferFrench ? 'fr' : 'en'}`;
  
  // Vérifier le cache
  const cached = getCachedCard(cacheKey);
  if (cached && cached.length > 0) {
    return cached[0];
  }

  try {
    // Utiliser le paramètre multiverseid pour rechercher
    const url = `${API_BASE_URL}?multiverseid=${multiverseid}`;
    
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const cards: MTGCard[] = data.cards || [];

    if (cards.length === 0) {
      return null;
    }

    let card = cards[0];
    
    // Si on préfère le français, chercher dans foreignNames
    if (preferFrench && card.foreignNames) {
      const frenchVersion = card.foreignNames.find(fn => 
        fn.language === 'French' || fn.language === 'fr'
      );
      
      if (frenchVersion) {
        // Créer une carte avec les données françaises
        card = {
          ...card,
          name: frenchVersion.name || card.name,
          imageUrl: frenchVersion.imageUrl || card.imageUrl,
          multiverseid: frenchVersion.multiverseid || card.multiverseid,
          text: frenchVersion.text || card.text,
          type: frenchVersion.type || card.type,
        };
      }
    }
    
    // Mettre en cache
    setCachedCard(cacheKey, [card]);

    return card;
  } catch (error) {
    console.error('Error searching card by multiverseid:', error);
    throw error;
  }
}

export async function searchCardsByName(name: string): Promise<MTGCard[]> {
  // Pour les cartes double-face, extraire le premier nom (avant " // ")
  let searchName = name;
  if (name.includes(' // ')) {
    searchName = name.split(' // ')[0].trim();
  }
  
  // Vérifier le cache
  const cached = getCachedCard(searchName);
  if (cached) {
    // Filtrer pour ne garder que les cartes qui correspondent au nom complet
    if (name.includes(' // ')) {
      return cached.filter(c => c.name === name || c.name.includes(' // '));
    }
    return cached;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}?name=${encodeURIComponent(searchName)}&pageSize=100`
    );

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    let cards: MTGCard[] = data.cards || [];

    // Filtrer pour ne garder que les cartes qui correspondent au nom complet
    if (name.includes(' // ')) {
      cards = cards.filter(c => c.name === name || c.name.includes(' // '));
    }

    // Mettre en cache avec le nom de recherche (premier nom pour les cartes double-face)
    setCachedCard(searchName, cards);

    return cards;
  } catch (error) {
    console.error('Error searching cards:', error);
    throw error;
  }
}

