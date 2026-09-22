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

Les exports PocketBase **0.22 et antérieurs** utilisent `schema` (options imbriquées). PocketBase **0.23+** n’importe que `fields`. Un import de l’ancien JSON ignore donc `userCollectionId`, et les règles `userCollectionId.userId = @request.auth.id` échouent. Utiliser `pocketbase_schema_export.json` (format `fields`) ou reconvertir avec `node scripts/convert-pb-schema-v23.mjs <ancien.json> <nouveau.json> pocketbase/api-rules.json`.

## Decks — partage communautaire

Règles versionnées :

- `listRule` : propriétaire **ou** `visibility = "public"`
- `viewRule` : propriétaire **ou** public **ou** unlisted (accès par id / lien)
- create / update / delete : propriétaire uniquement

Champs à ajouter dans Admin → `decks` : `format`, `visibility`, `description`, `commanders` (json), `sourceDeckId` (relation decks, sans cascade), `isValidForFormat` (bool), `tags` (json). Le JSON `cards` stocke `{ mainboard, sideboard, maybeboard }`.

Appliquer aussi le script de migration `scripts/migrate-decks-catalog.js` après ajout des champs.

## Playtest — lobbies et table

Collections définies dans [`pocketbase/play-collections.json`](../pocketbase/play-collections.json). Les appliquer avec :

```
PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... npm run ensure-play-collections
```

(ou coller le JSON via Admin → Import collections). Règles versionnées dans `api-rules.json` :

- `play_lobbies` : liste des lobbies non fermés ; writes hôte uniquement
- `play_seats` : join seulement si `waiting` ; siège = soi ou hôte
- `play_matches` : snapshot `state` + `actionSeq` (bootstrap) ; joueurs via `playerIds`
- `play_match_actions` : journal append-only des coups (anti-rollback concurrent)
- `play_rtc_signals` : signaling WebRTC éphémère (from/to)

TURN (NAT difficiles) : `VITE_ICE_SERVERS` dans `.env.example`.

## Création de comptes

`users.createRule` est vide : pas d’inscription publique. Les comptes se créent depuis l’admin applicatif (rôle `admin`) ou l’admin PocketBase.

## Références

- [SECURITY.md](./SECURITY.md)
- [GDPR_DEPLOYMENT.md](./GDPR_DEPLOYMENT.md)
- Export schéma (format PocketBase 0.23+ `fields`) : `pocketbase_schema_export.json`
