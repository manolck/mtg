# Audit de sécurité — MTG Collection App

## Vue d'ensemble

Ce document décrit les mesures de sécurité de l'application MTG Collection. L'application s'appuie sur **PocketBase** pour l'authentification et le stockage des données.

> **Note :** Une version antérieure de ce document décrivait Firebase / Firestore. Voir [LEGACY_FIREBASE.md](./LEGACY_FIREBASE.md).

## Authentification

### PocketBase Auth

- **Méthode** : Email / mot de passe (`pb.collection('users').authWithPassword`)
- **Sessions** : Token géré par `pb.authStore` (auto-refresh côté client)
- **Déconnexion** : `pb.authStore.clear()`

### Côté application

- Routes protégées via `ProtectedRoute` (redirection `/login`)
- Page admin via `AdminRoute` (vérification rôle `admin` dans le profil)
- Pas d'inscription publique dans l'UI (création de comptes par admin ou PocketBase Admin)

### Recommandations

- Mots de passe minimum 6 caractères (PocketBase) — envisager une politique plus stricte côté app
- Limiter l'exposition de l'interface admin PocketBase (`/_/`)
- Envisager 2FA si PocketBase / votre infra le supporte pour les admins
- HTTPS obligatoire en production (front + API PocketBase)

## Contrôle d'accès aux données

### PocketBase — règles API

La sécurité des données repose sur les **règles d'API** configurées dans l'admin PocketBase pour chaque collection :

| Collection | Principe attendu |
|------------|------------------|
| `collection` | Lecture/écriture limitée au propriétaire (`userId`) ; lecture possible pour utilisateurs authentifiés si vue multi-collections |
| `decks` | Privé au propriétaire |
| `wishlist` | Privé au propriétaire |
| `imports` | Privé au propriétaire |
| `users` | Lecture profil selon besoins ; écriture propriétaire ou admin |
| `legal` | Consentements liés à `userId` |

**Action requise** : auditer et documenter les règles exactes dans votre instance PocketBase (non versionnées dans ce dépôt).

### Vue multi-collections

La page Collection permet de consulter les collections d'autres utilisateurs (`useAllCollections`). Cela suppose des règles PocketBase autorisant la **lecture** des cartes des autres utilisateurs connectés. À valider selon votre politique de confidentialité.

## Validation des données

- Validation **Zod** sur les imports CSV
- Nettoyage des objets avant envoi PocketBase (`cleanForPocketBase` — suppression des `undefined`)
- Pas de sanitization HTML systématique sur tous les champs utilisateur (backlog)

## API externes

### Scryfall

- HTTPS uniquement
- File d'attente + retry (`apiQueue`, `fetchWithRetry`)
- Respecter les [conditions Scryfall](https://scryfall.com/docs/api) (User-Agent, pas de surcharge)

### MTGJSON / API prix

- Données mises en cache localement (IndexedDB)
- API backend optionnelle (`VITE_PRICE_API_URL`)

## Frontend

- Pas de secrets dans le code source (variables `VITE_*` exposées au client — normal pour URL PocketBase)
- Sentry optionnel pour le suivi d'erreurs (ne pas logger de mots de passe)
- Consentement RGPD (`GDPRConsent`) stocké dans collection `legal`

## PWA & Service Worker

- Service worker actif uniquement en production
- Precache des assets statiques (Workbox)
- Pas de cache des données utilisateur sensibles dans le SW

## RGPD

- Composant de consentement au premier login
- Page [Privacy Policy](../src/pages/PrivacyPolicy.tsx) (`/privacy-policy`)
- Export collection (CSV/JSON) disponible
- Suppression de compte : via page Admin (admin) — export complet utilisateur à renforcer si exigence RGPD stricte

Voir [GDPR_DEPLOYMENT.md](./GDPR_DEPLOYMENT.md).

## Checklist production

- [ ] PocketBase en HTTPS avec certificat valide
- [ ] Règles API PocketBase revues pour chaque collection
- [ ] `VITE_POCKETBASE_URL` correct en build prod
- [ ] Interface admin PocketBase protégée (réseau, mot de passe fort)
- [ ] Sauvegardes `pb_data` planifiées
- [ ] `VITE_SENTRY_DSN` configuré pour le monitoring
- [ ] Politique de confidentialité à jour

## Références

- [POCKETBASE_HTTPS_SETUP.md](./POCKETBASE_HTTPS_SETUP.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [LEGACY_FIREBASE.md](./LEGACY_FIREBASE.md)
