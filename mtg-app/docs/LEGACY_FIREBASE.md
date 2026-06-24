# Firebase — archive (migration vers PocketBase)

## Contexte

L'application **MTG Collection** a migré de **Firebase** (Authentication + Firestore + Storage) vers **PocketBase**.

La stack active est documentée dans [README.md](../README.md) et [ARCHITECTURE.md](./ARCHITECTURE.md).

## Fichiers supprimés (nettoyage 2025)

Les artefacts Firebase suivants ont été retirés du dépôt :

- `firebase.json`, `.firebaserc`
- `firestore.rules`, `firestore.indexes.json`, `storage.rules`
- Dossier `functions/` (Cloud Functions MTGJSON)
- Workflows GitHub : `deploy-production.yml`, `deploy-staging.yml`, `firestore-backup.yml`
- `docs/FIRESTORE_INDEXES.md`

## Équivalences fonctionnelles

| Firebase (ancien) | PocketBase (actuel) |
|-------------------|---------------------|
| Firebase Auth | Auth intégrée collection `users` |
| Firestore `users/{id}/collection` | Collection `collection` |
| Firestore `users/{id}/decks` | Collection `decks` |
| Firestore `users/{id}/profile` | Champs sur `users` |
| Firestore `users/{id}/imports` | Collection `imports` |
| Firebase Storage (avatars) | Avatars emoji (`avatarId` en base) |
| Firebase Functions (prix MTGJSON) | API HTTP optionnelle (`VITE_PRICE_API_URL`) + cache IndexedDB client |
| `firestore.rules` | Règles API PocketBase (admin UI) |

## Variables d'environnement obsolètes

```env
# Ne plus utiliser
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_FUNCTIONS_URL
```

Utiliser :

```env
VITE_POCKETBASE_URL=https://pb.votre-domaine.example
VITE_PRICE_API_URL=   # optionnel
VITE_SENTRY_DSN=      # optionnel
```

## Migration des données Firestore

Si vous avez encore des données Firestore à migrer, un script d'export/import dédié est nécessaire (non inclus). Schémas PocketBase : [ARCHITECTURE.md](./ARCHITECTURE.md).

## Admin

Voir [PROTOCOLE_ADMIN.md](../PROTOCOLE_ADMIN.md) (PocketBase uniquement).
