# Mots-clés Magic: The Gathering

Ce document liste tous les mots-clés (keyword abilities) et actions de mots-clés de Magic: The Gathering, avec leurs traductions en anglais et en français, pour permettre la recherche de cartes dans une collection.

## Structure des données

Le fichier `keywords.json` contient :

1. **keywords** : Liste des capacités de mots-clés (keyword abilities)
   - Capacités statiques (toujours actives)
   - Capacités déclenchées (se déclenchent lors d'événements)
   - Capacités activées (coût à payer pour activer)

2. **keyword_actions** : Liste des actions de mots-clés (instructions à suivre)

## Format d'un mot-clé

```json
{
  "id": "flying",
  "en": "Flying",
  "fr": "Vol",
  "category": "static"
}
```

- **id** : Identifiant unique du mot-clé
- **en** : Nom en anglais
- **fr** : Nom en français
- **category** : Catégorie (static, triggered, activated)

## Utilisation

### Recherche par mot-clé

Vous pouvez rechercher des cartes en utilisant le nom du mot-clé en anglais ou en français :

```typescript
import { findKeyword, filterCardsByKeyword } from '../utils/keywordSearch';

// Rechercher un mot-clé
const keyword = findKeyword('flying'); // ou 'vol'
console.log(keyword); // { id: 'flying', en: 'Flying', fr: 'Vol', category: 'static' }

// Filtrer des cartes par mot-clé
const cardsWithFlying = filterCardsByKeyword(
  cards,
  'flying', // ou 'vol'
  (card) => card.mtgData?.text || ''
);
```

### Recherche dans le texte d'une carte

```typescript
import { cardHasKeyword, extractKeywordsFromCard } from '../utils/keywordSearch';

// Vérifier si une carte a un mot-clé
const hasFlying = cardHasKeyword(cardText, 'flying');

// Extraire tous les mots-clés d'une carte
const keywords = extractKeywordsFromCard(cardText);
```

### Recherche par catégorie

```typescript
import { getKeywordsByCategory } from '../utils/keywordSearch';

// Récupérer tous les mots-clés statiques
const staticKeywords = getKeywordsByCategory('static');

// Récupérer tous les mots-clés déclenchés
const triggeredKeywords = getKeywordsByCategory('triggered');

// Récupérer tous les mots-clés activés
const activatedKeywords = getKeywordsByCategory('activated');
```

## Exemples de recherche

### Recherche en français
```typescript
// Rechercher toutes les cartes avec "Vol"
const flyingCards = filterCardsByKeyword(cards, 'vol', getCardText);
```

### Recherche en anglais
```typescript
// Rechercher toutes les cartes avec "Flying"
const flyingCards = filterCardsByKeyword(cards, 'flying', getCardText);
```

### Recherche partielle
```typescript
import { searchKeywords } from '../utils/keywordSearch';

// Rechercher tous les mots-clés contenant "strike"
const strikeKeywords = searchKeywords('strike');
// Retourne: Double Strike, First Strike
```

## Liste des catégories

- **static** : Capacités statiques (toujours actives)
  - Exemples : Flying, Trample, Haste, Deathtouch
  
- **triggered** : Capacités déclenchées (se déclenchent lors d'événements)
  - Exemples : Mentor, Evolve, Renown
  
- **activated** : Capacités activées (coût à payer pour activer)
  - Exemples : Cycling, Equip, Crew
  
- **keyword_actions** : Actions de mots-clés (instructions à suivre)
  - Exemples : Scry, Investigate, Explore

## Notes importantes

1. **Recherche insensible à la casse** : La recherche fonctionne en minuscules et majuscules
2. **Recherche partielle** : Vous pouvez rechercher une partie du nom du mot-clé
3. **Multilingue** : La recherche fonctionne en anglais et en français
4. **Performance** : Les fonctions sont optimisées pour rechercher rapidement dans de grandes collections

## Mise à jour

Cette liste est basée sur les règles officielles de Magic: The Gathering. Elle peut être mise à jour lorsque de nouveaux mots-clés sont ajoutés au jeu.

## Exemples de mots-clés populaires

### Capacités statiques
- **Flying** / **Vol** : Ne peut être bloquée que par des créatures avec Vol ou Portée
- **Trample** / **Piétinement** : Les dégâts excédentaires sont assignés au joueur
- **Haste** / **Célérité** : Peut attaquer et utiliser des capacités activées immédiatement
- **Deathtouch** / **Contact mortel** : Tout montant de dégâts est considéré comme létal
- **Lifelink** / **Lien de vie** : Les dégâts infligés font gagner autant de points de vie

### Capacités déclenchées
- **Mentor** / **Mentor** : Met un marqueur +1/+1 sur une créature attaquante avec moins de force
- **Evolve** / **Évolution** : Met un marqueur +1/+1 quand une créature avec plus de force/endurance entre
- **Renown** / **Renommée** : Met des marqueurs +1/+1 quand la créature inflige des dégâts de combat

### Capacités activées
- **Cycling** / **Cyclage** : Coût, défausser cette carte : piocher une carte
- **Equip** / **Équiper** : Attacher cet équipement à une créature
- **Crew** / **Équipage** : Engager des créatures pour que le véhicule devienne une créature





