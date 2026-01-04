export interface Avatar {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export const AVATARS: Avatar[] = [
  { id: '1', name: 'Plains', emoji: '⚪', color: '#F5F5DC' },
  { id: '2', name: 'Island', emoji: '🔵', color: '#4169E1' },
  { id: '3', name: 'Swamp', emoji: '⚫', color: '#2F2F2F' },
  { id: '4', name: 'Mountain', emoji: '🔴', color: '#DC143C' },
  { id: '5', name: 'Forest', emoji: '🟢', color: '#228B22' },
  { id: '6', name: 'Dragon', emoji: '🐉', color: '#FF6347' },
  { id: '7', name: 'Wizard', emoji: '🧙', color: '#9370DB' },
  { id: '8', name: 'Knight', emoji: '⚔️', color: '#C0C0C0' },
  { id: '9', name: 'Angel', emoji: '👼', color: '#FFD700' },
  { id: '10', name: 'Demon', emoji: '😈', color: '#8B0000' },
  { id: '11', name: 'Elf', emoji: '🧝', color: '#90EE90' },
  { id: '12', name: 'Goblin', emoji: '👺', color: '#FF4500' },
  { id: '13', name: 'Zombie', emoji: '🧟', color: '#556B2F' },
  { id: '14', name: 'Vampire', emoji: '🧛', color: '#8B0000' },
  { id: '15', name: 'Phoenix', emoji: '🔥', color: '#FF8C00' },
  { id: '16', name: 'Hydra', emoji: '🐍', color: '#32CD32' },
  { id: '17', name: 'Sphinx', emoji: '🦁', color: '#FFD700' },
  { id: '18', name: 'Kraken', emoji: '🐙', color: '#191970' },
  { id: '19', name: 'Planeswalker', emoji: '⭐', color: '#9370DB' },
  { id: '20', name: 'Artifact', emoji: '⚙️', color: '#C0C0C0' },
];

export function getAvatarById(id: string): Avatar | undefined {
  return AVATARS.find(avatar => avatar.id === id);
}

export function getDefaultAvatar(): Avatar {
  return AVATARS[0];
}

