# Firebase — archive (migration vers PocketBase)

## Contexte

L'application **MTG Collection** a migré de **Firebase** (Authentication + Firestore + Storage) vers **PocketBase**.

La stack active est documentée dans :

- [README.md](../README.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)

## Fichiers legacy encore présents

| Fichier / dossier | Statut |
|-------------------|--------|
| `firebase.json` | Legacy — déploiement Firebase Hosting |
| `.github/workflows/deploy-*.yml` | Références Firebase (Hosting, Firestore rules) |
| `docs/FIRESTORE_INDEXES.md` | Historique Firestore |
| Anciens docs mentionnant `VITE_FIREBASE_*` | Remplacés par `VITE_POCKETBASE_URL` |

Ces fichiers peuvent être supprimés ou migrés lors d'une prochaine passe de nettoyage.

## Variables d'environnement obsolètes

Ne plus utiliser :

```env
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_FUNCTIONS_URL
```

Utiliser à la place :

```env
VITE_POCKETBASE_URL=https://pb.votre-domaine.example
```

## Équivalences fonctionnelles

| Firebase | PocketBase |
|----------|------------|
| Firebase Auth | Auth intégrée collection `users` |
| Firestore `users/{id}/collection` | Collection `collection` |
| Firestore `users/{id}/decks` | Collection `decks` |
| Firestore `users/{id}/profile` | Champs sur `users` |
| Firestore `users/{id}/imports` | Collection `imports` |
| Firebase Storage (avatars) | Avatars emoji (`avatarId` en base, pas de fichier) |
| `firestore.rules` | Règles API PocketBase (admin UI) |

## Migration des données

Si vous avez encore des données Firestore à migrer, il faudra un script d'export/import dédié (non inclus dans ce dépôt). Les schémas PocketBase actuels sont décrits dans [ARCHITECTURE.md](./ARCHITECTURE.md).

## Documentation admin historique

Les procédures Firebase dans d'anciennes versions de `PROTOCOLE_ADMIN.md` et `ADMIN_SETUP.md` ne s'appliquent plus. Utiliser [PROTOCOLE_ADMIN.md](../PROTOCOLE_ADMIN.md) (version PocketBase).
