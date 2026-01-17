# Configuration du Changement de Mot de Passe dans PocketBase

## Problème

L'erreur `400 (Bad Request)` lors du changement de mot de passe peut être due à :

1. **Règles d'API trop restrictives** : Les règles ne permettent pas la mise à jour du champ `password`
2. **Format des données incorrect** : Les données envoyées ne sont pas au bon format
3. **Permissions insuffisantes** : L'utilisateur n'a pas les permissions nécessaires

## Solution : Configurer les Règles d'API

### Collection `users` - Règle Update

Dans PocketBase Admin (`https://pb.mtg-app.duckdns.org/_/`), allez dans :

1. **Collections** → **users**
2. Onglet **API rules**
3. Section **Update Rule**

### Règle Recommandée

Pour permettre à un utilisateur de modifier son propre mot de passe :

```
@request.auth.id != "" && id = @request.auth.id
```

Cette règle permet à un utilisateur authentifié de modifier uniquement son propre enregistrement.

### Règle Alternative (Plus Permissive)

Si vous voulez permettre aux utilisateurs de modifier leur mot de passe ET leurs autres champs :

```
@request.auth.id != "" && (
  id = @request.auth.id || 
  (@collection.users.id(@request.auth.id).roles != null && @collection.users.id(@request.auth.id).roles ~ "admin")
)
```

Cette règle permet :
- À un utilisateur de modifier son propre profil
- Aux admins de modifier tous les profils

## Vérification

### Test 1 : Vérifier les Règles Actuelles

1. Allez dans PocketBase Admin
2. Collections → users → API rules
3. Vérifiez que la **Update Rule** permet la mise à jour par l'utilisateur lui-même

### Test 2 : Tester le Changement de Mot de Passe

1. Connectez-vous à l'application
2. Allez dans la page Profile
3. Essayez de changer votre mot de passe
4. Si l'erreur persiste, vérifiez la console du navigateur pour plus de détails

## Dépannage

### Erreur 400 : "Something went wrong"

**Causes possibles :**

1. **Règles d'API** :
   - ✅ Vérifiez que la règle Update permet `id = @request.auth.id`
   - ✅ Vérifiez que l'utilisateur est bien authentifié

2. **Format des données** :
   - ✅ `password` et `passwordConfirm` doivent être identiques
   - ✅ Le mot de passe doit respecter les règles de validation (min. 6 caractères généralement)

3. **Permissions** :
   - ✅ L'utilisateur doit être authentifié (`@request.auth.id != ""`)
   - ✅ L'ID de l'utilisateur doit correspondre à l'ID de l'enregistrement

### Erreur 403 : "Forbidden"

**Cause** : Les règles d'API ne permettent pas la mise à jour.

**Solution** : Modifiez la règle Update pour permettre `id = @request.auth.id`.

### Erreur 401 : "Unauthorized"

**Cause** : L'utilisateur n'est pas authentifié.

**Solution** : Vérifiez que l'utilisateur est bien connecté avant de tenter le changement de mot de passe.

## Code Actuel

Le code dans `Profile.tsx` fait :

1. **Réauthentification** : Vérifie le mot de passe actuel avec `authWithPassword()`
2. **Mise à jour** : Utilise `pb.collection('users').update()` avec `password` et `passwordConfirm`

```typescript
// Réauthentification
const authResult = await pb.collection('users').authWithPassword(email, currentPassword);
const authenticatedUserId = authResult.record.id;

// Mise à jour du mot de passe
await pb.collection('users').update(authenticatedUserId, {
  password: newPassword,
  passwordConfirm: newPassword,
});
```

## Notes Importantes

1. **Sécurité** : La réauthentification est nécessaire pour vérifier que l'utilisateur connaît son mot de passe actuel
2. **passwordConfirm** : PocketBase exige que `password` et `passwordConfirm` soient identiques
3. **Règles d'API** : Les règles doivent explicitement permettre la mise à jour du champ `password`

## Configuration Complète des Règles pour `users`

### List Rule
```
@request.auth.id != "" && (id = @request.auth.id || (@collection.users.id(@request.auth.id).roles != null && @collection.users.id(@request.auth.id).roles ~ "admin"))
```

### View Rule
```
@request.auth.id != "" && (id = @request.auth.id || (@collection.users.id(@request.auth.id).roles != null && @collection.users.id(@request.auth.id).roles ~ "admin"))
```

### Create Rule
```
@request.auth.id = "" || (@collection.users.id(@request.auth.id).roles != null && @collection.users.id(@request.auth.id).roles ~ "admin")
```

### Update Rule ⚠️ **IMPORTANT pour le changement de mot de passe**
```
@request.auth.id != "" && (id = @request.auth.id || (@collection.users.id(@request.auth.id).roles != null && @collection.users.id(@request.auth.id).roles ~ "admin"))
```

### Delete Rule
```
@request.auth.id != "" && (@collection.users.id(@request.auth.id).roles != null && @collection.users.id(@request.auth.id).roles ~ "admin")
```

La règle **Update** est cruciale : elle doit permettre à un utilisateur de modifier son propre enregistrement (`id = @request.auth.id`).
