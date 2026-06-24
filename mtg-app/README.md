# MTG Collection

Application web (PWA) pour gérer une collection Magic: The Gathering : import/export CSV, decks, wishlist, statistiques, scan de cartes par caméra.

## Fonctionnalités

- **Authentification** — Email / mot de passe via [PocketBase](https://pocketbase.io/)
- **Collection** — Import CSV (ManaBox et variantes), recherche avancée, export (CSV, JSON, Deckbox, Moxfield)
- **Decks** — Création et édition de decks à partir de la collection
- **Wishlist** — Liste de cartes recherchées avec recherche Scryfall
- **Statistiques** — Valeur estimée (MTGJSON / Scryfall), répartitions par couleur, rareté, édition
- **Scan** — Détection de carte (OpenCV), OCR du nom (Tesseract), reconnaissance d’édition (logos Scryfall)
- **Profil** — Avatar, pseudonyme, langue de recherche, changement de mot de passe, historique des imports
- **Administration** — Gestion des utilisateurs et des rôles (page `/admin`, rôle `admin`)
- **PWA** — Installable sur mobile/desktop, service worker en production
- **RGPD** — Consentement au premier login, politique de confidentialité

## Prérequis

- Node.js 18+ et npm
- Une instance **PocketBase** accessible (locale ou distante)
- Navigateur moderne (Chrome, Firefox, Safari, Edge)

## Installation

```bash
cd mtg-app
npm install
```

### Variables d'environnement

Créez un fichier `.env.local` à la racine de `mtg-app` :

```env
# URL de l'instance PocketBase (recommandé en dev)
VITE_POCKETBASE_URL=http://127.0.0.1:8090

# API backend pour les prix MTGJSON (optionnel)
VITE_PRICE_API_URL=

# Monitoring Sentry (optionnel, production)
VITE_SENTRY_DSN=
```

Sans `VITE_POCKETBASE_URL`, l'app utilise une URL par défaut selon le protocole de la page (voir `src/services/pocketbase.ts`).

### Premier administrateur

Voir [PROTOCOLE_ADMIN.md](./PROTOCOLE_ADMIN.md) et [docs/POCKETBASE_ROLES_MIGRATION.md](./docs/POCKETBASE_ROLES_MIGRATION.md).

## Utilisation locale

```bash
npm run dev
```

L'application est servie sur `http://localhost:3000` (port configuré dans `vite.config.ts`).

Pour le développement quotidien, PocketBase doit tourner en parallèle. Voir [docs/DEVELOPMENT_LOCAL.md](./docs/DEVELOPMENT_LOCAL.md).

## Scripts utiles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement Vite |
| `npm run build` | Build de production |
| `npm run preview` | Prévisualiser le build |
| `npm test` | Tests unitaires (Jest) |
| `npm run test:e2e` | Tests E2E (Playwright) |
| `npm run lint` | ESLint |
| `npm run generate-pwa-icons` | Génère `icon-192.png` et `icon-512.png` |
| `npm run build-scryfall-dictionary` | Reconstruit le dictionnaire OCR Scryfall |

## Format CSV (import)

### Format avec en-têtes (ManaBox / export standard)

Colonnes supportées : **Name** (requis), **Quantity**, **Set code**, **Set name**, **Collector number**, **Foil**, **Rarity**, **Condition**, **Language**.

```csv
Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,Condition,Language
Lightning Bolt,M21,Core Set 2021,161,false,Common,4,Near Mint,en
```

### Formats simples sans en-têtes

- Nom seul : `Lightning Bolt`
- Nom + quantité : `Lightning Bolt, 4`
- Nom + quantité + édition : `Lightning Bolt, 4, M21`

Séparateurs acceptés : virgule, point-virgule, tabulation.

## Structure du projet

```
mtg-app/
├── src/
│   ├── components/     # UI, cartes, scan, import, layout
│   ├── context/        # Auth, toasts
│   ├── hooks/          # useCollection, useDecks, useWishlist, etc.
│   ├── pages/          # Collection, Decks, Scan, Profile, Admin…
│   ├── services/       # PocketBase, Scryfall, prix, export
│   ├── types/          # Types TypeScript
│   └── utils/          # OCR, détection carte, validation
├── docs/               # Documentation technique
├── e2e/                # Tests Playwright
├── public/             # Assets statiques, dictionnaires
└── scripts/            # Utilitaires (admin, scraping, PWA)
```

## Déploiement

En production, l'app est une **SPA statique** (build Vite) servie derrière **nginx**, avec **PocketBase** sur un sous-domaine HTTPS (ex. `pb.mtg-app.duckdns.org`).

- Configuration nginx front : [NGINX_CONFIG.md](./NGINX_CONFIG.md)
- Configuration PocketBase HTTPS : [docs/POCKETBASE_HTTPS_SETUP.md](./docs/POCKETBASE_HTTPS_SETUP.md)
- Variables et environnements : [docs/ENVIRONMENTS.md](./docs/ENVIRONMENTS.md)

> **Note :** Les workflows GitHub Actions (`.github/workflows/deploy-*.yml`) référencent encore Firebase Hosting. Le déploiement actuel documenté utilise nginx + build statique. Voir [docs/ENVIRONMENTS.md](./docs/ENVIRONMENTS.md).

## APIs externes

| Source | Usage |
|--------|--------|
| [Scryfall](https://scryfall.com/docs/api) | Données cartes, recherche, icônes d’éditions |
| [MTG Dev API](https://docs.magicthegathering.io) | Fallback cartes |
| MTGJSON | Prix de collection (cache IndexedDB + API optionnelle) |
| Magic Corporation | Fallback noms pour l’OCR du scan |

Respecter les conditions d’utilisation de Scryfall (notamment pas de revente des données brutes).

## Technologies

- React 19, TypeScript, Vite 7, React Router 7, Tailwind CSS
- PocketBase (auth + base de données)
- Tesseract.js + OpenCV.js (scan)
- vite-plugin-pwa + Workbox
- Sentry (optionnel), Jest, Playwright

## Documentation

| Document | Sujet |
|----------|--------|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Architecture technique |
| [docs/DEVELOPMENT_LOCAL.md](./docs/DEVELOPMENT_LOCAL.md) | Développement local |
| [docs/SECURITY.md](./docs/SECURITY.md) | Sécurité |
| [docs/TESTING.md](./docs/TESTING.md) | Tests |
| [PROTOCOLE_ADMIN.md](./PROTOCOLE_ADMIN.md) | Création d’un admin |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Dépannage |

## Historique Firebase

L'application a migré de Firebase (Auth + Firestore) vers **PocketBase**. Des fichiers legacy (`firebase.json`, références Firestore dans certains docs) peuvent subsister ; la stack active est PocketBase. Voir [docs/LEGACY_FIREBASE.md](./docs/LEGACY_FIREBASE.md).

## Licence

Ce projet est fourni tel quel, sans garantie.
