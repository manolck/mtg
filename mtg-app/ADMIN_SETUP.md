# Configuration du premier administrateur

L'application utilise **PocketBase** pour l'authentification et les rôles. Il n'y a pas d'inscription publique dans l'app : les comptes sont créés par un admin ou via l'interface PocketBase.

## Méthode 1 : Interface PocketBase Admin (recommandée)

1. Ouvrez l'admin PocketBase (ex. `http://127.0.0.1:8090/_/` ou `https://pb.mtg-app.duckdns.org/_/`)
2. Allez dans **Collections** → **users**
3. **Créez un utilisateur** avec email et mot de passe
4. Définissez le champ **`roles`** (JSON) :
   ```json
   ["user", "admin"]
   ```
5. Connectez-vous à l'application web : le lien **Admin** apparaît dans la navbar

## Méthode 2 : Via l'application (si un admin existe déjà)

1. Connectez-vous avec un compte admin
2. Allez sur `/admin`
3. **+ Créer un utilisateur** — cochez **Admin** si besoin
4. Ou **Modifier** un utilisateur existant pour ajouter le rôle admin

## Structure des rôles

- Format actuel : tableau JSON `roles`, ex. `["user", "admin"]`
- Tous les utilisateurs ont au minimum `"user"`
- Le rôle `"admin"` donne accès à `/admin`

Détails et migration depuis l'ancien champ `role` : [docs/POCKETBASE_ROLES_MIGRATION.md](./docs/POCKETBASE_ROLES_MIGRATION.md).

## Vérification

1. Connexion avec le compte admin
2. Lien **Admin** visible dans la navbar
3. Page `/admin` : liste des utilisateurs, création, modification des rôles

## Dépannage

| Problème | Solution |
|----------|----------|
| Pas de lien Admin | Vérifier `roles` contient `"admin"` dans PocketBase |
| Accès refusé sur `/admin` | Se déconnecter / reconnecter ; vérifier les règles API PocketBase |
| Utilisateur sans profil complet | Remplir `pseudonym`, `avatarId` via l'app Profil après première connexion |

## Script `setup-admin`

```bash
npm run setup-admin
```

Ce script affiche un message indiquant que l'administration se fait via PocketBase. Voir `scripts/setup-admin-simple.js`.

## Documentation complète

- [PROTOCOLE_ADMIN.md](./PROTOCOLE_ADMIN.md)
- [docs/POCKETBASE_ROLES_MIGRATION.md](./docs/POCKETBASE_ROLES_MIGRATION.md)
