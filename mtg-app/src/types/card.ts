export interface MTGCard {
  id?: string;
  name: string;
  layout?: string; // "normal", "transform", "double-faced", "split", etc.
  manaCost?: string;
  cmc?: number;
  colors?: string[];
  type?: string;
  types?: string[];
  subtypes?: string[];
  rarity?: string;
  set?: string;
  setName?: string;
  text?: string;
  artist?: string;
  number?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  multiverseid?: number;
  imageUrl?: string;
  foreignNames?: Array<{
    name: string;
    language: string;
    text?: string;
    type?: string;
    flavor?: string;
    imageUrl?: string;
    multiverseid?: number;
    identifiers?: {
      scryfallId?: string;
      multiverseId?: number;
    };
  }>;
}

export interface UserCard {
  id: string;
  name: string;
  quantity: number;
  set?: string;
  setCode?: string;
  collectorNumber?: string;
  rarity?: string;
  condition?: string;
  language?: string;
  mtgData?: MTGCard;
  // Pour les cartes double-face
  backImageUrl?: string;
  backMultiverseid?: number;
  backMtgData?: MTGCard; // Données complètes de la face arrière
  userId: string;
  createdAt: Date;
  // Pour le mode "toutes les collections"
  ownerId?: string; // ID du propriétaire de la carte
  ownerProfile?: { // Profil du propriétaire (pour l'avatar)
    avatarId?: string;
    pseudonym?: string;
  };
}

export interface ParsedCard {
  name: string;
  quantity?: number;
  set?: string;
  setCode?: string;
  collectorNumber?: string;
  rarity?: string;
  condition?: string;
  language?: string;
  multiverseid?: number;
  scryfallId?: string;
}

export interface WishlistItem {
  id: string;
  name: string;
  quantity: number; // Quantité désirée
  set?: string;
  setCode?: string;
  collectorNumber?: string;
  rarity?: string;
  language?: string;
  mtgData?: MTGCard;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  notes?: string; // Notes personnelles sur la carte
  targetPrice?: number; // Prix cible pour les notifications (optionnel)
  scryfallId?: string; // Pour faciliter la recherche
}

