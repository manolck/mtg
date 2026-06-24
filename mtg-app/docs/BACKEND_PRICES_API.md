# API backend pour les prix MTGJSON

## Vue d'ensemble

L'application peut récupérer les prix des cartes de deux façons :

1. **Côté client (par défaut)** — cache IndexedDB + téléchargement MTGJSON (`mtgjsonPriceService.ts`, `mtgjsonPriceServiceIndexedDB.ts`)
2. **API HTTP optionnelle** — si `VITE_PRICE_API_URL` est configurée (`mtgjsonPriceServiceAPI.ts`)

L'ancienne implémentation via **Firebase Cloud Functions** + Firestore a été supprimée du dépôt.

## Configuration client

```env
VITE_PRICE_API_URL=https://votre-api-prix.example.com
```

En développement, si cette variable est absente ou l'API ne répond pas, l'app utilise un **fallback Scryfall** via `priceService.ts`.

## Endpoints attendus (API optionnelle)

### `GET /getCardPrice`

Paramètres query : `cardName` (requis), `setCode` (optionnel).

Réponse JSON :

```json
{
  "price": {
    "usd": "1.50",
    "usdFoil": "3.00",
    "eur": "1.20",
    "eurFoil": "2.50"
  }
}
```

### `POST /updateMTGJSONPrices`

Déclenche une mise à jour des prix côté serveur. Réponse :

```json
{ "success": true }
```

## Comportement dans l'app

- `App.tsx` appelle `initializeMTGJSONPrices()` au démarrage
- Si `shouldUpdatePrices()` (dernière MAJ > 15 jours en localStorage), `updateMTGJSONPrices()` est appelé en arrière-plan
- En dev sans API : pas d'erreur bloquante, fallback Scryfall

## Implémenter votre propre API

Vous pouvez héberger un service séparé (Node, Python, etc.) qui :

1. Télécharge périodiquement [MTGJSON AllPrices](https://mtgjson.com/downloads/all-files/)
2. Indexe les prix (base SQL, Redis, fichiers, etc.)
3. Expose les endpoints ci-dessus avec CORS autorisé pour votre domaine front

Le dossier `functions/` (Firebase) n'existe plus ; utilisez ce document comme contrat d'API.

## Références

- [MTGJSON_PRICES.md](./MTGJSON_PRICES.md)
- [MTGJSON_DOWNLOAD_EXPLANATION.md](./MTGJSON_DOWNLOAD_EXPLANATION.md) — note : partie historique Firestore
- [LEGACY_FIREBASE.md](./LEGACY_FIREBASE.md)
