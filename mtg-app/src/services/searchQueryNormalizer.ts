/**
 * Normalise les termes de recherche pour que français et anglais donnent les mêmes résultats.
 * Ex. "bâton" et "staff" → même requête Scryfall "staff".
 */

/** Mots français → anglais (sous-types, types, termes courants MTG) */
const FR_TO_EN: Record<string, string> = {
  // Sous-types d'artefacts / équipements
  bâton: 'staff',
  bâtons: 'staff',
  épée: 'sword',
  épées: 'sword',
  armure: 'armor',
  armures: 'armor',
  hache: 'axe',
  haches: 'axe',
  arc: 'bow',
  arcs: 'bow',
  clé: 'key',
  clés: 'key',
  baguette: 'wand',
  baguettes: 'wand',
  // Types de créatures courants
  clerc: 'cleric',
  clercs: 'cleric',
  sorcier: 'wizard',
  sorciers: 'wizard',
  guerrier: 'warrior',
  guerriers: 'warrior',
  archer: 'archer',
  archers: 'archer',
  soldat: 'soldier',
  soldats: 'soldier',
  chevalier: 'knight',
  chevaliers: 'knight',
  ange: 'angel',
  anges: 'angel',
  démon: 'demon',
  démons: 'demon',
  dragon: 'dragon',
  dragons: 'dragon',
  elfe: 'elf',
  elfes: 'elf',
  gobelin: 'goblin',
  gobelins: 'goblin',
  zombie: 'zombie',
  zombies: 'zombie',
  vampire: 'vampire',
  vampires: 'vampire',
  esprit: 'spirit',
  esprits: 'spirit',
  humain: 'human',
  humains: 'human',
  bête: 'beast',
  bêtes: 'beast',
  serpent: 'serpent',
  serpents: 'serpent',
  oiseau: 'bird',
  oiseaux: 'bird',
  loup: 'wolf',
  loups: 'wolf',
  chat: 'cat',
  chats: 'cat',
  ours: 'bear',
  chien: 'dog',
  chiens: 'dog',
  // Mots-clés courants (raccourcis)
  vol: 'flying',
  célérité: 'haste',
  initiative: 'first strike',
  'double initiative': 'double strike',
  défenseur: 'defender',
  'contact mortel': 'deathtouch',
  'lien de vie': 'lifelink',
  portée: 'reach',
  vigilance: 'vigilance',
  piétinement: 'trample',
  intimidation: 'intimidate',
  indestructible: 'indestructible',
  // Types de sorts
  créature: 'creature',
  créatures: 'creature',
  sorcierie: 'sorcery',
  sorcellerie: 'sorcery',
  enchantement: 'enchantment',
  enchantements: 'enchantment',
  instantané: 'instant',
  instantanés: 'instant',
  artefact: 'artifact',
  artefacts: 'artifact',
  terrain: 'land',
  terrains: 'land',
  plaine: 'plains',
  plaines: 'plains',
  île: 'island',
  îles: 'island',
  marais: 'swamp',
  montagne: 'mountain',
  montagnes: 'mountain',
  forêt: 'forest',
  forêts: 'forest',
  légendaire: 'legendary',
  éphémère: 'ephemerate',
  feu: 'fire',
  // Articles / prépositions (pour "bâton du feu" → "staff of fire")
  du: 'of',
  de: 'of',
  la: 'the',
  le: 'the',
  les: 'the',
  un: 'a',
  une: 'a',
  et: 'and',
  des: 'of',
};

/**
 * Normalise un mot pour Scryfall (anglais).
 * Si le mot est en français (dans FR_TO_EN), retourne l'équivalent anglais ; sinon inchangé.
 */
export function normalizeWordToEnglish(word: string): string {
  const w = word.toLowerCase().trim();
  if (!w) return word;
  return FR_TO_EN[w] ?? word;
}

/**
 * Normalise une requête complète : chaque mot est traduit si on a une entrée FR→EN.
 * Ainsi "bâton" → "staff", "staff" reste "staff", et les deux donnent les mêmes résultats.
 */
export function normalizeSearchQueryToEnglish(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return query;
  const words = trimmed.split(/\s+/);
  const normalized = words.map(normalizeWordToEnglish);
  return normalized.join(' ');
}
