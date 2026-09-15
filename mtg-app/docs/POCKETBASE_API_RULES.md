# Règles API PocketBase (versionnées)

Fichier source : [`pocketbase/api-rules.json`](../pocketbase/api-rules.json).

Ces règles sont la **référence** attendue en production. PocketBase ne les charge pas automatiquement : les appliquer dans **Admin → Collections → [collection] → API rules**, puis les garder alignées avec ce fichier.

`null` / règle vide = opération interdite via l’API utilisateur (réservée aux superusers PocketBase).

## Application manuelle

1. Ouvrir l’admin PocketBase (`/_/`)
2. Pour chaque collection listée dans `api-rules.json`, coller `listRule`, `viewRule`, `createRule`, `updateRule`, `deleteRule`
3. Enregistrer
4. Vérifier : un utilisateur non admin ne peut pas lire la wishlist / les decks / les consentements `legal` d’un autre compte

## Wishlist — correction obligatoire

L’export historique avait une règle tautologique :

```
@request.auth.id != "" && (@request.auth.id = userId || @request.auth.id != "")
```

Cela autorisait **tout utilisateur connecté** à lister toutes les wishlists. La règle versionnée est propriétaire uniquement :

```
@request.auth.id != "" && @request.auth.id = userId
```

## Collections lisibles par les pairs

`user_collections` et `collection_items` restent listables par tout utilisateur authentifié : c’est le comportement de la vue multi-collections. Si la politique de confidentialité change, restreindre `listRule` / `viewRule` à `userId = @request.auth.id` (et `userCollectionId.userId = @request.auth.id`).

## Création de comptes

`users.createRule` est vide : pas d’inscription publique. Les comptes se créent depuis l’admin applicatif (rôle `admin`) ou l’admin PocketBase.

## Références

- [SECURITY.md](./SECURITY.md)
- [GDPR_DEPLOYMENT.md](./GDPR_DEPLOYMENT.md)
- Export schéma (champs, pas forcément les règles à jour) : `pocketbase_schema_export.json`
