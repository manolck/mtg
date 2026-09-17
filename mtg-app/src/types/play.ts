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
  | { type: 'moveCard'; userId: string; instanceId: string; from: ZoneName; to: ZoneName; facedown?: boolean; toTop?: boolean }
  | { type: 'searchLibrary'; userId: string; instanceId: string; to: ZoneName; toTop?: boolean; shuffle?: boolean }
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
