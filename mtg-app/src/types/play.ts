import type { DeckEntry, DeckFormat } from './deck';

export type LobbyStatus = 'waiting' | 'playing' | 'closed';

export type ZoneName = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command';

export const ZONE_NAMES: ZoneName[] = [
  'library',
  'hand',
  'battlefield',
  'graveyard',
  'exile',
  'command',
];

export interface DeckSnapshot {
  deckId: string;
  name: string;
  format: DeckFormat;
  mainboard: DeckEntry[];
  commanders: DeckEntry[];
}

export interface PlayLobby {
  id: string;
  hostId: string;
  name: string;
  format: DeckFormat;
  maxPlayers: number;
  status: LobbyStatus;
  createdAt: Date;
  updatedAt?: Date;
}

export interface PlaySeat {
  id: string;
  lobbyId: string;
  userId: string;
  seatIndex: number;
  ready: boolean;
  deckId?: string;
  deckSnapshot?: DeckSnapshot | null;
  displayName?: string;
}

export interface TableCard {
  instanceId: string;
  scryfallId: string;
  name: string;
  imageUrl?: string;
  backImageUrl?: string;
  backName?: string;
  manaCost?: string;
  typeLine?: string;
  cmc?: number;
  tapped: boolean;
  facedown: boolean;
  /** Face verso visible (cartes recto-verso uniquement) */
  transformed?: boolean;
  /** Permanent auquel cette carte est attachée (aura / équipement). */
  attachedTo?: string;
  /** Marqueurs (id wiki → quantité). */
  counters?: Record<string, number>;
  /** Jeton créé en jeu (n’appartient pas au deck). */
  isToken?: boolean;
}

export interface TokenBlueprint {
  scryfallId: string;
  name: string;
  imageUrl?: string;
  backImageUrl?: string;
  backName?: string;
  manaCost?: string;
  typeLine?: string;
  cmc?: number;
}

/** `['*']` = tous les joueurs, sinon ids d’utilisateurs. */
export type RevealAudience = string[];

export const REVEAL_ALL = '*';

export interface ShownHandCard {
  instanceId: string;
  to: RevealAudience;
}

export interface PlayerTableState {
  userId: string;
  seatIndex: number;
  displayName?: string;
  life: number;
  poison: number;
  library: TableCard[];
  hand: TableCard[];
  battlefield: TableCard[];
  graveyard: TableCard[];
  exile: TableCard[];
  command: TableCard[];
  /** Main entière visible pour cette audience. */
  shownHandTo?: RevealAudience;
  /** Cartes de la main montrées individuellement. */
  shownHandCards?: ShownHandCard[];
  /** Dessus de bibliothèque révélé pour cette audience. */
  libraryTopRevealedTo?: RevealAudience;
}

export interface MatchState {
  version: number;
  turnSeatIndex: number;
  format: DeckFormat | string;
  players: PlayerTableState[];
}

export interface PlayMatch {
  id: string;
  lobbyId: string;
  state: MatchState;
  updatedBy: string;
  playerIds: string[];
}

export type PlayAction =
  | { type: 'draw'; userId: string }
  | { type: 'shuffleLibrary'; userId: string }
  | {
      type: 'moveCard';
      userId: string;
      instanceId: string;
      from: ZoneName;
      to: ZoneName;
      facedown?: boolean;
      toTop?: boolean;
      /** 1 = dessus. Si N > nombre de cartes, dessous. */
      libraryPosition?: number;
    }
  | {
      type: 'searchLibrary';
      userId: string;
      instanceId: string;
      to: ZoneName;
      toTop?: boolean;
      libraryPosition?: number;
      shuffle?: boolean;
      facedown?: boolean;
    }
  | { type: 'showHand'; userId: string; viewerIds: RevealAudience }
  | { type: 'hideHand'; userId: string }
  | { type: 'showHandCard'; userId: string; instanceId: string; viewerIds: RevealAudience }
  | { type: 'hideHandCard'; userId: string; instanceId: string }
  | { type: 'revealLibraryTop'; userId: string; viewerIds: RevealAudience }
  | { type: 'hideLibraryTop'; userId: string }
  | { type: 'attachCard'; userId: string; instanceId: string; hostInstanceId: string | null }
  | { type: 'setFacedown'; userId: string; instanceId: string; facedown: boolean }
  | { type: 'setCounter'; userId: string; instanceId: string; counterId: string; delta: number }
  | { type: 'addToken'; userId: string; card: TokenBlueprint; quantity?: number }
  | { type: 'removeToken'; userId: string; instanceId: string }
  | { type: 'scry'; userId: string; count: number; onTop: string[]; onBottom: string[] }
  | { type: 'surveil'; userId: string; count: number; onTop: string[]; toGraveyard: string[] }
  | { type: 'tap'; userId: string; instanceId: string }
  | { type: 'flip'; userId: string; instanceId: string; backImageUrl?: string; backName?: string }
  | { type: 'setLife'; userId: string; delta: number }
  | { type: 'setPoison'; userId: string; delta: number }
  | { type: 'passTurn' }
  | { type: 'mulligan'; userId: string };

export interface RtcSignalPayload {
  type: 'offer' | 'answer' | 'ice';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export const ZONE_LABELS: Record<ZoneName, string> = {
  library: 'Bibliothèque',
  hand: 'Main',
  battlefield: 'Champ de bataille',
  graveyard: 'Cimetière',
  exile: 'Exil',
  command: 'Commandement',
};
