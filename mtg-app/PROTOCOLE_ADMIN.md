# Protocole de création du premier administrateur

L'application utilise **PocketBase** pour l'authentification et la gestion des utilisateurs.

## Créer le premier administrateur

### Étape 1 : Créer l'utilisateur dans PocketBase

1. Ouvrez l'interface d'administration PocketBase (`/_/` sur votre instance)
2. **Collections** → **users** → **New record**
3. Renseignez :
   - **email**
   - **password** / **passwordConfirm**
   - **roles** : `["user", "admin"]` (type JSON)
   - Optionnel : `pseudonym`, `avatarId`, `preferredLanguage`

### Étape 2 : Vérifier dans l'application

1. Ouvrez l'app (ex. `http://localhost:3000` ou votre URL de prod)
2. Connectez-vous avec l'email et le mot de passe créés
3. Le lien **Admin** doit apparaître dans la barre de navigation
4. Accédez à `/admin` pour gérer les autres utilisateurs

## Créer d'autres administrateurs

Une fois connecté en tant qu'admin :

1. Page **Admin** → **+ Créer un utilisateur**
2. Cochez **Admin** pour attribuer `roles: ["user", "admin"]`
3. Ou **Modifier** un utilisateur existant et activer le rôle Admin

## Format du champ `roles`

```json
["user", "admin"]
```

- `"user"` : toujours présent (rôle de base)
- `"admin"` : accès à la page `/admin` et gestion des comptes

Le code accepte encore l'ancien champ `role: "admin"` pour compatibilité. Voir [docs/POCKETBASE_ROLES_MIGRATION.md](./docs/POCKETBASE_ROLES_MIGRATION.md).

## Dépannage

### Le lien « Admin » n'apparaît pas

1. Vérifier dans PocketBase que `roles` contient bien `"admin"`
2. Se déconnecter et se reconnecter
3. Vérifier la console navigateur (F12) pour des erreurs API PocketBase
4. Vérifier que `VITE_POCKETBASE_URL` pointe vers la bonne instance

### Erreur « Accès refusé » sur `/admin`

1. Vérifier les **règles API** de la collection `users` dans PocketBase
2. L'utilisateur connecté doit pouvoir lire son propre enregistrement (champ `roles`)

### PocketBase inaccessible depuis le front HTTPS

En production, PocketBase doit être en **HTTPS** (ex. reverse proxy nginx). Voir [docs/POCKETBASE_HTTPS_SETUP.md](./docs/POCKETBASE_HTTPS_SETUP.md).

## Sécurité

- Mots de passe forts (12+ caractères recommandés)
- Limiter le nombre de comptes admin
- Ne pas exposer l'URL `/_/` admin PocketBase publiquement sans protection supplémentaire
- Sauvegardes régulières de `pb_data`

## Références

- [ADMIN_SETUP.md](./ADMIN_SETUP.md)
- [docs/POCKETBASE_ROLES_MIGRATION.md](./docs/POCKETBASE_ROLES_MIGRATION.md)
- [Documentation PocketBase — Auth](https://pocketbase.io/docs/authentication/)
