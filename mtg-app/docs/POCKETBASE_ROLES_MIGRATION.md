# Migration des Rôles vers un Système Multi-Rôles

## Changement Effectué

Le système de rôles a été modifié pour permettre à un utilisateur d'avoir **plusieurs rôles simultanément** au lieu d'un seul rôle.

### Avant
- Un utilisateur avait un seul rôle : `role: 'user'` ou `role: 'admin'`
- Pour donner les droits admin, il fallait remplacer `'user'` par `'admin'`

### Après
- Un utilisateur a un tableau de rôles : `roles: ['user', 'admin']`
- Le rôle `'user'` est **toujours présent** (par défaut)
- Le rôle `'admin'` peut être **ajouté ou retiré** sans affecter le rôle `'user'`

## Structure dans PocketBase

### Collection `users`

Le champ `role` (Select) doit être remplacé par un champ `roles` (JSON) :

1. Allez dans **Collections** → **users**
2. Supprimez le champ `role` (Select) si vous voulez
3. Ajoutez un nouveau champ `roles` :
   - Type : `JSON`
   - Required : ❌
   - Options : (aucune option spéciale)

**OU** gardez les deux pour la compatibilité pendant la migration.

### Format des Données

**Ancien format (compatible) :**
```json
{
  "role": "admin"
}
```

**Nouveau format :**
```json
{
  "roles": ["user", "admin"]
}
```

Le code gère automatiquement la migration depuis l'ancien format.

## Fonctionnalités

### Page Admin

Dans la page Admin (`/admin`), vous pouvez maintenant :

1. **Créer un utilisateur** :
   - ✅ Case à cocher "User" (toujours cochée, non modifiable)
   - ☑️ Case à cocher "Admin" (optionnelle)
   - Si "Admin" est cochée, l'utilisateur aura `roles: ['user', 'admin']`
   - Sinon, il aura `roles: ['user']`

2. **Modifier un utilisateur** :
   - ✅ Case à cocher "User" (toujours cochée, non modifiable)
   - ☑️ Case à cocher "Admin" (peut être cochée/décochée)
   - Cliquer sur "Enregistrer" ajoute ou retire le rôle admin
   - Le rôle `'user'` reste toujours présent

### Affichage des Rôles

Dans le tableau des utilisateurs, tous les rôles sont affichés sous forme de badges :
- Badge gris : `User`
- Badge violet : `Admin`

## Code Modifié

### Types (`src/types/user.ts`)

```typescript
export interface UserProfile {
  // ...
  roles?: string[]; // Au lieu de role?: 'admin' | 'user'
  // ...
}

// Helper functions
export function hasRole(profile: UserProfile | null | undefined, role: string): boolean
export function isAdmin(profile: UserProfile | null | undefined): boolean
export function getUserRoles(profile: UserProfile | null | undefined): string[]
```

### Services

- `adminAuth.ts` : `setAdminRole()` pour ajouter/retirer le rôle admin
- `profileService.ts` : Gestion de la migration depuis l'ancien format
- `useAdmin.ts` : Vérifie si `'admin'` est dans le tableau `roles`

### Compatibilité

Le code gère automatiquement la compatibilité avec l'ancien format :
- Si `roles` existe et est un tableau → utilise `roles`
- Si `role` existe (string) → convertit en `['user']` ou `['user', 'admin']`
- Sinon → utilise `['user']` par défaut

## Migration des Données Existantes

### Option 1 : Migration Automatique (Recommandée)

Le code migre automatiquement les données lors de la lecture. Aucune action requise.

### Option 2 : Migration Manuelle dans PocketBase

Si vous voulez migrer toutes les données d'un coup :

1. Allez dans **Collections** → **users**
2. Pour chaque utilisateur avec `role: 'admin'` :
   - Modifiez le champ `roles` (ou créez-le) : `["user", "admin"]`
   - Supprimez le champ `role` si vous voulez

### Option 3 : Script de Migration

Vous pouvez créer un script pour migrer tous les utilisateurs :

```javascript
// Dans la console PocketBase Admin (/_/)
const users = await pb.collection('users').getFullList();

for (const user of users) {
  let roles = ['user'];
  if (user.role === 'admin') {
    roles = ['user', 'admin'];
  }
  
  await pb.collection('users').update(user.id, { roles });
}
```

## Vérification

1. **Créer un nouvel utilisateur** :
   - Créez un utilisateur via la page Admin
   - Vérifiez dans PocketBase que `roles: ["user"]` est présent

2. **Ajouter le rôle admin** :
   - Modifiez l'utilisateur et cochez "Admin"
   - Vérifiez que `roles: ["user", "admin"]` est présent

3. **Retirer le rôle admin** :
   - Décochez "Admin" et enregistrez
   - Vérifiez que `roles: ["user"]` est présent (sans "admin")

4. **Vérifier l'accès admin** :
   - L'utilisateur avec `roles: ["user", "admin"]` doit pouvoir accéder à `/admin`
   - L'utilisateur avec `roles: ["user"]` ne doit pas pouvoir accéder à `/admin`

## Notes Importantes

1. **Le rôle `'user'` est toujours présent** : Il ne peut pas être retiré
2. **Compatibilité ascendante** : Le code fonctionne avec l'ancien format (`role`) et le nouveau (`roles`)
3. **Migration automatique** : Les données sont migrées automatiquement lors de la lecture
4. **PocketBase** : Le champ `roles` doit être de type JSON pour stocker un tableau

## Dépannage

### L'utilisateur n'a plus accès à `/admin` après la migration

- ✅ Vérifiez que `roles` contient `"admin"` : `["user", "admin"]`
- ✅ Déconnectez-vous et reconnectez-vous pour rafraîchir les permissions
- ✅ Vérifiez la console du navigateur pour d'éventuelles erreurs

### Erreur "roles is not defined"

- ✅ Vérifiez que le champ `roles` existe dans la collection `users` dans PocketBase
- ✅ Vérifiez que le type est `JSON`
- ✅ Le code gère la compatibilité avec l'ancien format, mais il est recommandé d'avoir le champ `roles`

### Les rôles ne s'affichent pas correctement

- ✅ Vérifiez que `roles` est un tableau JSON valide : `["user", "admin"]` et non `"user,admin"`
- ✅ Vérifiez que le format est correct dans PocketBase
