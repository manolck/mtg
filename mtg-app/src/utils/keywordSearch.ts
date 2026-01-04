import keywordsData from '../data/keywords.json';

export interface Keyword {
  id: string;
  en: string;
  fr: string;
  category: 'static' | 'triggered' | 'activated' | 'keyword_actions';
}

export interface KeywordAction {
  id: string;
  en: string;
  fr: string;
}

export interface AbilityWord {
  id: string;
  en: string;
  fr: string;
}

/**
 * Récupère tous les mots-clés (keyword abilities)
 */
export function getAllKeywords(): Keyword[] {
  return keywordsData.keywords as Keyword[];
}

/**
 * Récupère toutes les actions de mots-clés
 */
export function getAllKeywordActions(): KeywordAction[] {
  return keywordsData.keyword_actions as KeywordAction[];
}

/**
 * Récupère tous les ability words (mots-clés d'aptitude)
 */
export function getAllAbilityWords(): AbilityWord[] {
  return (keywordsData as any).ability_words as AbilityWord[] || [];
}

/**
 * Recherche un mot-clé par son nom (en anglais ou français)
 * @param searchTerm - Terme de recherche (peut être en anglais ou français)
 * @returns Le mot-clé trouvé ou null
 */
export function findKeyword(searchTerm: string): Keyword | null {
  const term = searchTerm.toLowerCase().trim();
  
  const keyword = getAllKeywords().find(k => 
    k.en.toLowerCase() === term ||
    k.fr.toLowerCase() === term ||
    k.id.toLowerCase() === term ||
    k.en.toLowerCase().includes(term) ||
    k.fr.toLowerCase().includes(term)
  );
  
  return keyword || null;
}

/**
 * Recherche une action de mot-clé par son nom (en anglais ou français)
 * @param searchTerm - Terme de recherche (peut être en anglais ou français)
 * @returns L'action trouvée ou null
 */
export function findKeywordAction(searchTerm: string): KeywordAction | null {
  const term = searchTerm.toLowerCase().trim();
  
  const action = getAllKeywordActions().find(a => 
    a.en.toLowerCase() === term ||
    a.fr.toLowerCase() === term ||
    a.id.toLowerCase() === term ||
    a.en.toLowerCase().includes(term) ||
    a.fr.toLowerCase().includes(term)
  );
  
  return action || null;
}

/**
 * Recherche un ability word par son nom (en anglais ou français)
 * @param searchTerm - Terme de recherche (peut être en anglais ou français)
 * @returns L'ability word trouvé ou null
 */
export function findAbilityWord(searchTerm: string): AbilityWord | null {
  const term = searchTerm.toLowerCase().trim();
  
  const abilityWord = getAllAbilityWords().find(aw => 
    aw.en.toLowerCase() === term ||
    aw.fr.toLowerCase() === term ||
    aw.id.toLowerCase() === term ||
    aw.en.toLowerCase().includes(term) ||
    aw.fr.toLowerCase().includes(term)
  );
  
  return abilityWord || null;
}

/**
 * Recherche tous les mots-clés correspondant à un terme de recherche
 * @param searchTerm - Terme de recherche (peut être en anglais ou français)
 * @returns Liste des mots-clés correspondants
 */
export function searchKeywords(searchTerm: string): Keyword[] {
  const term = searchTerm.toLowerCase().trim();
  
  if (!term) {
    return getAllKeywords();
  }
  
  return getAllKeywords().filter(k => 
    k.en.toLowerCase().includes(term) ||
    k.fr.toLowerCase().includes(term) ||
    k.id.toLowerCase().includes(term)
  );
}

/**
 * Recherche toutes les actions de mots-clés correspondant à un terme de recherche
 * @param searchTerm - Terme de recherche (peut être en anglais ou français)
 * @returns Liste des actions correspondantes
 */
export function searchKeywordActions(searchTerm: string): KeywordAction[] {
  const term = searchTerm.toLowerCase().trim();
  
  if (!term) {
    return getAllKeywordActions();
  }
  
  return getAllKeywordActions().filter(a => 
    a.en.toLowerCase().includes(term) ||
    a.fr.toLowerCase().includes(term) ||
    a.id.toLowerCase().includes(term)
  );
}

/**
 * Recherche tous les ability words correspondant à un terme de recherche
 * @param searchTerm - Terme de recherche (peut être en anglais ou français)
 * @returns Liste des ability words correspondants
 */
export function searchAbilityWords(searchTerm: string): AbilityWord[] {
  const term = searchTerm.toLowerCase().trim();
  
  if (!term) {
    return getAllAbilityWords();
  }
  
  return getAllAbilityWords().filter(aw => 
    aw.en.toLowerCase().includes(term) ||
    aw.fr.toLowerCase().includes(term) ||
    aw.id.toLowerCase().includes(term)
  );
}

/**
 * Vérifie si une carte a un mot-clé spécifique dans son texte
 * @param cardText - Texte de la carte (peut être en anglais ou français)
 * @param keyword - Mot-clé à rechercher
 * @returns true si le mot-clé est trouvé dans le texte
 */
export function cardHasKeyword(cardText: string, keyword: Keyword | string): boolean {
  if (!cardText) return false;
  
  const text = cardText.toLowerCase();
  let keywordToSearch: Keyword | null = null;
  
  if (typeof keyword === 'string') {
    keywordToSearch = findKeyword(keyword);
    if (!keywordToSearch) return false;
  } else {
    keywordToSearch = keyword;
  }
  
  // Rechercher le mot-clé en anglais ou en français
  return text.includes(keywordToSearch.en.toLowerCase()) ||
         text.includes(keywordToSearch.fr.toLowerCase()) ||
         text.includes(keywordToSearch.id.toLowerCase());
}

/**
 * Récupère tous les mots-clés d'une carte en analysant son texte
 * @param cardText - Texte de la carte (peut être en anglais ou français)
 * @returns Liste des mots-clés trouvés dans le texte
 */
export function extractKeywordsFromCard(cardText: string): Keyword[] {
  if (!cardText) return [];
  
  const text = cardText.toLowerCase();
  const foundKeywords: Keyword[] = [];
  
  getAllKeywords().forEach(keyword => {
    if (text.includes(keyword.en.toLowerCase()) ||
        text.includes(keyword.fr.toLowerCase()) ||
        text.includes(keyword.id.toLowerCase())) {
      foundKeywords.push(keyword);
    }
  });
  
  return foundKeywords;
}

/**
 * Récupère toutes les actions de mots-clés d'une carte en analysant son texte
 * @param cardText - Texte de la carte (peut être en anglais ou français)
 * @returns Liste des actions trouvées dans le texte
 */
export function extractKeywordActionsFromCard(cardText: string): KeywordAction[] {
  if (!cardText) return [];
  
  const text = cardText.toLowerCase();
  const foundActions: KeywordAction[] = [];
  
  getAllKeywordActions().forEach(action => {
    if (text.includes(action.en.toLowerCase()) ||
        text.includes(action.fr.toLowerCase()) ||
        text.includes(action.id.toLowerCase())) {
      foundActions.push(action);
    }
  });
  
  return foundActions;
}

/**
 * Filtre les cartes par mot-clé
 * @param cards - Liste des cartes à filtrer
 * @param keywordSearch - Terme de recherche pour le mot-clé (en anglais ou français)
 * @param cardTextGetter - Fonction pour obtenir le texte d'une carte
 * @returns Liste des cartes correspondantes
 */
export function filterCardsByKeyword<T>(
  cards: T[],
  keywordSearch: string,
  cardTextGetter: (card: T) => string
): T[] {
  if (!keywordSearch.trim()) {
    return cards;
  }
  
  const keyword = findKeyword(keywordSearch);
  if (!keyword) {
    // Si le mot-clé n'est pas trouvé, retourner un tableau vide
    return [];
  }
  
  return cards.filter(card => {
    const cardText = cardTextGetter(card);
    return cardHasKeyword(cardText, keyword);
  });
}

/**
 * Récupère les mots-clés par catégorie
 * @param category - Catégorie de mots-clés
 * @returns Liste des mots-clés de cette catégorie
 */
export function getKeywordsByCategory(
  category: 'static' | 'triggered' | 'activated'
): Keyword[] {
  return getAllKeywords().filter(k => k.category === category);
}

/**
 * Récupère la traduction d'un mot-clé
 * @param keywordId - ID du mot-clé
 * @param language - Langue souhaitée ('en' ou 'fr')
 * @returns Le nom du mot-clé dans la langue demandée
 */
export function getKeywordTranslation(keywordId: string, language: 'en' | 'fr' = 'en'): string | null {
  const keyword = getAllKeywords().find(k => k.id === keywordId);
  if (!keyword) return null;
  
  return language === 'fr' ? keyword.fr : keyword.en;
}

