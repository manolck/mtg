# Architecture technique — MTG Collection

## Vue d'ensemble

Application web **React / TypeScript** (PWA) pour la gestion de collections Magic: The Gathering. Le frontend communique avec une instance **PocketBase** pour l'authentification et la persistance. Les données cartes proviennent principalement de **Scryfall**.

## Stack technologique

### Frontend

| Technologie | Version | Rôle |
|-------------|---------|------|
| React | 19.x | UI |
| TypeScript | 5.9 | Typage |
| Vite | 7.x | Build, dev server |
| React Router | 7.x | Routing |
| Tailwind CSS | 3.4 | Styles |
| react-window | 1.8 | Virtualisation (grilles) |
| Tesseract.js | 7.x | OCR (scan) |
| OpenCV.js | 4.8 (CDN) | Détection contours carte |

### Backend & services

| Service | Rôle |
|---------|------|
| **PocketBase** | Auth email/password, collections métier |
| **Scryfall API** | Cartes, recherche, sets, icônes |
| **MTG Dev API** | Fallback cartes |
| **MTGJSON** | Prix (IndexedDB + API backend optionnelle) |
| **Sentry** | Monitoring erreurs (si `VITE_SENTRY_DSN`) |

### PWA

- `vite-plugin-pwa` + Workbox
- Service worker enregistré uniquement en production (`src/main.tsx`)
- Manifest : standalone, icônes 192/512

## Modèle de données PocketBase

Collections utilisées par l'application :

### `users` (auth intégrée PocketBase)

Champs applicatifs typiques :

- `email`, `password` (auth PocketBase)
- `pseudonym`, `avatarId`, `preferredLanguage` (`en` | `fr`)
- `roles` : JSON, ex. `["user", "admin"]` (voir [POCKETBASE_ROLES_MIGRATION.md](./POCKETBASE_ROLES_MIGRATION.md))

### `collection`

Cartes d'un utilisateur :

- `userId` (relation ou string)
- `name`, `quantity`, `set`, `setCode`, `collectorNumber`, `rarity`, `condition`, `language`
- `mtgData` (JSON — objet carte Scryfall)
- Champs faces arrière optionnels (`backImageUrl`, `backMtgData`, …)

### `decks`

- `userId`, `name`
- `cards` : JSON — `[{ cardId, quantity }]`

### `wishlist`

- `userId`, `name`, `quantity`, métadonnées carte
- `notes`, `targetPrice`, `scryfallId`, `mtgData`

### `imports`

Jobs d'import CSV :

- `userId`, `status`, `mode` (`add` | `update`)
- `csvContent`, `progress`, `report`, `error`, timestamps

### `legal`

Consentements RGPD :

- `userId`, `type` (ex. `gdpr-consent`), métadonnées d'acceptation

## Routes applicatives

| Route | Accès | Page |
|-------|-------|------|
| `/login` | Public | Connexion |
| `/collection` | Auth | Collection (+ vue autres utilisateurs) |
| `/decks`, `/decks/:id` | Auth | Decks, éditeur |
| `/wishlist` | Auth | Wishlist |
| `/statistics` | Auth | Statistiques |
| `/profile` | Auth | Profil |
| `/scan` | Public* | Scan de cartes |
| `/admin` | Admin | Gestion utilisateurs |
| `/privacy-policy` | Public | Politique de confidentialité |

\* `/scan` est actuellement ouvert sans connexion pour faciliter les tests ; l'ajout à la collection nécessite d'être connecté.

## Architecture des dossiers

```
src/
  components/
    Card/           # Affichage cartes, grille virtualisée
    Scan/           # Wizard scan (caméra, OCR, édition)
    Import/         # Jobs d'import CSV
    Export/         # Export collection
    Layout/         # Navbar, ProtectedRoute, AdminRoute
    Legal/          # GDPRConsent
    UI/             # Button, Modal, Input, etc.
    Wishlist/       # Recherche wishlist
  context/          # AuthContext, ToastContext
  hooks/            # useCollection, useDecks, useWishlist, useProfile…
  pages/            # Pages par route
  services/         # pocketbase, collection, deck, scryfall, prix…
  types/            # card, deck, user, import
  utils/            # cardOcr, cardEdgeDetection, validation, apiQueue
```

## Flux de données

### Authentification

1. `AuthProvider` (`src/context/AuthContext.tsx`) utilise `pb.authWithPassword`
2. `pb.authStore.onChange` met à jour `currentUser`
3. `ProtectedRoute` redirige vers `/login` si non authentifié
4. `AdminRoute` vérifie le rôle `admin` via le profil PocketBase

### Collection

1. `useCollection` charge via `collectionService` (filtre `userId`)
2. Chargement paginé / progressif pour grandes collections
3. `useAllCollections` agrège les collections de tous les utilisateurs (lecture multi-joueurs)
4. Filtres et recherche côté client (`useDeferredValue`, `useMemo`)

### Import CSV

1. `csvParser` + validation Zod
2. Pour chaque ligne : résolution carte via Scryfall / MTG Dev
3. Persistance PocketBase + suivi dans `imports` (pause, reprise, rapport)

### Scan

1. `useCamera` → frame canvas
2. `detectCardEdges` (OpenCV) → quad MTG
3. `rectifyCardToCanvas` → image normalisée
4. `extractCardNameWithOCR` (Tesseract) + dictionnaire Scryfall / Magic Corporation
5. `matchCardLogoToSets` → éditions candidates
6. `searchPrintingsByExactName` + `addCardToCollection`

### Prix (statistiques)

1. `initializeMTGJSONPrices` au démarrage (`App.tsx`)
2. Cache IndexedDB (`mtgjsonPriceServiceIndexedDB`)
3. Mise à jour via API backend si `VITE_PRICE_API_URL` configurée
4. Fallback Scryfall en dev si API indisponible

## Sécurité

- **PocketBase** : règles d'accès par collection (à configurer dans l'admin PocketBase)
- Routes sensibles protégées côté client (`ProtectedRoute`, `AdminRoute`)
- Validation Zod sur imports CSV
- `errorHandler` centralisé + Sentry optionnel
- HTTPS requis en prod (front + PocketBase) pour éviter Mixed Content

Voir [SECURITY.md](./SECURITY.md) et [POCKETBASE_HTTPS_SETUP.md](./POCKETBASE_HTTPS_SETUP.md).

## Performance

- Lazy loading des routes (`React.lazy` dans `App.tsx`)
- Code splitting manuel (`react-vendor` chunk)
- Cache Scryfall en mémoire + file d'attente API (`apiQueue`, `fetchWithRetry`)
- Images lazy (`LazyImage`)
- Virtualisation disponible (`VirtualizedCardGrid`)

## État actuel & dette technique

### En place

- Tests unitaires (hooks, services) et E2E Playwright (auth, collection, deck, wishlist)
- CI : lint + tests + build sur PR
- PWA, RGPD, export multi-formats, scan fonctionnel

### À améliorer

- Couverture de tests (< 70 % objectif backlog)
- Workflows de déploiement : build via `ci.yml` ; déploiement manuel ou à automatiser vers nginx
- Documentation utilisateur / page Aide
- Fonctionnalités communauté (échanges, groupes) — non implémentées
- Notifications prix wishlist — non implémentées

## APIs externes

### Scryfall

- Base : `https://api.scryfall.com`
- Rate limiting via `scryfallQueue` (~100 ms entre requêtes)
- Endpoints : search, cards, sets

### MTG Dev

- Fallback si Scryfall échoue
- Limite : 5000 req/h

## Références

- [DEVELOPMENT_LOCAL.md](./DEVELOPMENT_LOCAL.md)
- [ENVIRONMENTS.md](./ENVIRONMENTS.md)
- [POCKETBASE_ROLES_MIGRATION.md](./POCKETBASE_ROLES_MIGRATION.md)
- [LEGACY_FIREBASE.md](./LEGACY_FIREBASE.md)
