# Architecture Technique - MTG Collection App

## Vue d'ensemble

Application web React/TypeScript pour la gestion de collections Magic: The Gathering avec authentification Firebase et stockage Firestore.

## Stack Technologique

### Frontend
- **React 19.2.0** - Bibliothèque UI
- **TypeScript 5.9.3** - Typage statique
- **Vite 7.2.4** - Build tool et dev server
- **React Router 7.11.0** - Routing
- **Tailwind CSS 3.4.19** - Styling

### Backend & Services
- **Firebase Authentication** - Authentification utilisateurs
- **Cloud Firestore** - Base de données NoSQL
- **Firebase Storage** - Stockage des avatars
- **Scryfall API** - Données des cartes MTG
- **MTG Dev API** - API alternative pour les cartes

## Architecture des Données

### Structure Firestore

```
users/
  {userId}/
    collection/
      {cardId}/
        - id: string
        - name: string
        - quantity: number
        - set?: string
        - setCode?: string
        - collectorNumber?: string
        - rarity?: string
        - condition?: string
        - language?: string
        - mtgData?: MTGCard
        - userId: string
        - createdAt: Timestamp
    
    decks/
      {deckId}/
        - id: string
        - name: string
        - cards: Array<{cardId: string, quantity: number}>
        - userId: string
        - createdAt: Timestamp
    
    profile/
      data/
        - uid: string
        - email: string
        - pseudonym?: string
        - avatarId?: string
        - role?: 'admin' | 'user'
        - createdAt: Timestamp
        - updatedAt: Timestamp
    
    imports/
      {importId}/
        - id: string
        - status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
        - mode: 'add' | 'update'
        - csvContent?: string
        - progress?: ImportProgress
        - report?: ImportReport
        - createdAt: Timestamp
        - updatedAt: Timestamp
```

### Types Principaux

#### UserCard
Représente une carte dans la collection d'un utilisateur avec ses métadonnées.

#### MTGCard
Données complètes d'une carte depuis l'API Scryfall/MTG Dev.

#### Deck
Deck personnalisé avec liste de cartes et quantités.

#### UserProfile
Profil utilisateur avec pseudonyme, avatar, et rôle.

## Architecture des Composants

### Structure des Dossiers

```
src/
  components/        # Composants réutilisables
    Card/           # Composants liés aux cartes
    Import/         # Composants d'import
    Layout/         # Navigation, routes
    UI/             # Composants UI génériques
  
  context/          # Context API (AuthContext)
  
  hooks/            # Hooks personnalisés React
    useCollection.ts    # Gestion de la collection
    useDecks.ts         # Gestion des decks
    useAuth.ts          # Authentification
    useProfile.ts       # Profil utilisateur
    useImports.ts       # Gestion des imports
    useAdmin.ts         # Fonctions admin
    useAllCollections.ts # Vue globale collections
  
  pages/            # Pages de l'application
    Collection.tsx      # Page principale collection
    Decks.tsx           # Liste des decks
    DeckBuilder.tsx     # Éditeur de deck
    Profile.tsx         # Profil utilisateur
    Admin.tsx           # Administration
    Login.tsx           # Connexion
  
  services/         # Services externes
    firebase.ts         # Configuration Firebase
    scryfallApi.ts      # Intégration Scryfall
    mtgApi.ts           # Intégration MTG Dev API
    csvParser.ts        # Parsing CSV
    adminAuth.ts        # Authentification admin
  
  types/            # Types TypeScript
    card.ts
    deck.ts
    user.ts
    import.ts
  
  utils/            # Utilitaires
    keywordSearch.ts   # Recherche par mots-clés
```

## Flux de Données

### Authentification
1. Utilisateur se connecte via `AuthContext`
2. Firebase Auth gère la session
3. `useAuth` hook expose l'utilisateur actuel
4. Routes protégées vérifient l'authentification

### Chargement de Collection
1. `useCollection` hook charge depuis Firestore
2. Chargement par batch (100 cartes initialement)
3. Chargement progressif pour grandes collections
4. Cache des profils utilisateurs (5 min TTL)

### Import CSV
1. Fichier CSV parsé via `csvParser`
2. Pour chaque carte :
   - Recherche dans Scryfall/MTG Dev API
   - Création document Firestore
   - Mise à jour du progrès
3. Support pause/reprise/annulation
4. Rapport d'import généré

### Recherche et Filtres
1. Filtrage côté client (mémoire)
2. Utilisation de `useDeferredValue` pour performance
3. Recherche par nom, mots-clés, types, couleurs, etc.
4. Optimisation avec `useMemo` pour éviter recalculs

## Sécurité

### Règles Firestore
- Collections : lecture publique (utilisateurs connectés), écriture privée
- Decks : privés (propriétaire uniquement)
- Profils : lecture publique, écriture propriétaire/admin
- Imports : privés (propriétaire uniquement)

### Authentification
- Email/Password via Firebase Auth
- Rôles admin gérés dans Firestore
- Protection CSRF gérée par Firebase

## Performance

### Optimisations Actuelles
- Chargement par batch (100 cartes)
- Cache mémoire pour API Scryfall (1h)
- Rate limiting API (100ms entre requêtes)
- `useDeferredValue` pour filtres
- `useMemo` pour calculs coûteux
- Lazy loading des images (à implémenter)

### Points d'Amélioration
- Pagination virtuelle pour grandes collections
- Service Worker pour cache offline
- Index Firestore manquants
- Code splitting plus agressif
- Compression des images

## APIs Externes

### Scryfall API
- Base URL: `https://api.scryfall.com`
- Rate limit: ~10 req/s (100ms delay)
- Cache: 1 heure en mémoire
- Endpoints utilisés:
  - `/cards/{id}` - Par Scryfall ID
  - `/cards/{set}/{number}` - Par set et numéro
  - `/cards/search` - Recherche

### MTG Dev API
- Base URL: `https://api.magicthegathering.io/v1`
- Rate limit: 5000 req/heure
- Utilisé en fallback si Scryfall échoue

## Dettes Techniques Identifiées

1. **Tests** : Aucun test unitaire/intégration/E2E
2. **Index Firestore** : Manquants pour certaines requêtes
3. **Error Handling** : Gestion d'erreurs non centralisée
4. **Performance** : Pas de pagination virtuelle
5. **Offline** : Pas de support offline
6. **Monitoring** : Pas de logging/monitoring
7. **CI/CD** : Pas de pipeline automatisé
8. **Documentation** : Documentation utilisateur incomplète

## Points d'Attention

### Rate Limiting API
- Scryfall : 100ms delay entre requêtes
- Risque de rate limit sur imports massifs
- Solution : Queue système avec retry

### Coûts Firestore
- Lecture : ~$0.06/100k documents
- Écriture : ~$0.18/100k documents
- Attention aux requêtes non indexées
- Optimiser les batch operations

### Sécurité
- Règles Firestore à valider régulièrement
- Pas de validation côté serveur (Cloud Functions)
- Données sensibles dans Firestore

## Plan de Refactoring Priorisé

### Priorité Haute
1. Ajouter tests unitaires (hooks, services)
2. Créer index Firestore manquants
3. Centraliser gestion d'erreurs
4. Implémenter pagination virtuelle

### Priorité Moyenne
5. Service Worker pour offline
6. Monitoring et logging
7. CI/CD pipeline
8. Documentation utilisateur

### Priorité Basse
9. Migration vers Cloud Functions pour logique métier
10. Optimisation bundle size
11. Tests E2E complets

