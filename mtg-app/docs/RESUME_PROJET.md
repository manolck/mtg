# Résumé du projet MTG Collection App

## Ce que fait l'application

**MTG Collection App** est une application web (PWA) pour gérer une **collection de cartes Magic: The Gathering** : suivi des cartes, decks, wishlist, statistiques et estimation de valeur.

### Fonctionnalités principales

| Fonctionnalité | Description |
|----------------|-------------|
| **Authentification** | Connexion par email/mot de passe via **PocketBase** (plus Firebase). |
| **Collection** | Ajout, modification, suppression de cartes ; import CSV (plusieurs formats) ; recherche et filtres (couleur, rareté, type, langue, set) ; vue par propriétaire ou « toutes les collections ». |
| **Decks** | Création et édition de decks ; ajout de cartes depuis la collection ; construction de deck dédiée. |
| **Wishlist** | Liste de souhaits avec recherche Scryfall et enrichissement français (Magic Corporation). |
| **Statistiques** | Valeur estimée de la collection (MTGJSON + Scryfall en secours), graphiques. |
| **Profil** | Pseudonyme, avatar (stocké sur PocketBase), historique des imports, préférences. |
| **Admin** | Interface réservée aux rôles admin (gestion utilisateurs, etc.). |
| **PWA** | Installable, mode hors-ligne partiel, notifications de mise à jour. |
| **RGPD** | Consentement et page Politique de confidentialité. |

### Stack technique

- **Frontend** : React 19, TypeScript, Vite 7, React Router 7, Tailwind CSS.
- **Backend / BDD** : **PocketBase** (auth, collections, decks, wishlist, profils, imports, fichiers avatars). Schéma dans `pocketbase_schema_export.json`.
- **APIs cartes** : Scryfall (recherche, images, prix secours), API MTG Dev (recherche par nom / MultiverseId), Magic Corporation (enrichissement noms français).
- **Prix** : Service principal **mtgjsonPriceServiceAPI** (appel à une API backend optionnelle via `VITE_PRICE_API_URL`). Si l’API n’est pas configurée ou indisponible, fallback sur Scryfall.
- **Qualité** : Jest + React Testing Library, Playwright E2E, ESLint, Sentry (optionnel).

### Spécificités du projet

1. **PocketBase** : Toute la persistance (auth, données utilisateur) est gérée par PocketBase, pas par Firebase dans le code actuel.
2. **Prix** : Un seul chemin prix côté app : `priceService` → `mtgjsonPriceServiceAPI` (API backend) puis Scryfall en secours. Les anciennes implémentations « tout client » (localStorage, IndexedDB) ont été retirées.
3. **Firebase optionnel** : Le dossier `functions/` contient des Cloud Functions (Firebase) pour télécharger/indexer MTGJSON et exposer une API de prix. Elles sont **optionnelles** : si vous déployez Firebase et définissez `VITE_PRICE_API_URL`, l’app les utilise ; sinon elle s’appuie sur Scryfall. Les fichiers `firestore.rules` et `functions/` sont donc **legacy/optionnels** (pas utilisés par l’auth ni par la BDD principale).
4. **Import CSV** : Parsing flexible (avec/sans en-têtes, plusieurs séparateurs), validation Zod, jobs d’import suivis dans le profil (pause/reprise/annulation).
5. **Recherche** : Recherche par mots-clés (fichier `keywords.json` + `keywordSearch`), par nom (Scryfall + MTG API), avec enrichissement noms français (Magic Corporation).
6. **Scripts** : Scraping Magic Corporation (`scrape-magiccorporation.js`), setup admin PocketBase (`setup-admin.js`, `setup-admin-simple.js`), génération d’icônes PWA, audits Lighthouse.

---

## Code obsolète supprimé

- **`src/services/mtgjsonPriceService.ts`** : Ancienne implémentation des prix MTGJSON en localStorage, jamais importée (remplacée par `mtgjsonPriceServiceAPI`).
- **`src/services/mtgjsonPriceServiceIndexedDB.ts`** : Implémentation IndexedDB des prix MTGJSON, jamais importée.
- **`src/utils/indexedDB.ts`** : Utilitaire IndexedDB utilisé uniquement par le service IndexedDB ci-dessus ; supprimé avec lui.

Aucun autre fichier du projet n’importait ces modules. Les tests et le build s’appuient uniquement sur `mtgjsonPriceServiceAPI` et `priceService`.

---

## Note sur la documentation

Le **README.md** à la racine de `mtg-app` décrit encore une configuration **Firebase** (Auth, Firestore, Storage). L’application utilise désormais **PocketBase** pour l’auth et les données. Il est recommandé de mettre à jour le README pour refléter PocketBase et les variables d’environnement actuelles (`VITE_POCKETBASE_URL`, `VITE_PRICE_API_URL`, etc.).
