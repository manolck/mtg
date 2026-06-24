# Développement local

## Prérequis

1. **Node.js 18+** et `npm install` dans `mtg-app/`
2. **PocketBase** en cours d'exécution (local ou réseau)
3. Fichier **`.env.local`** (optionnel mais recommandé)

## Démarrage rapide

```bash
# Terminal 1 — PocketBase (exemple)
./pocketbase serve
# Par défaut : http://127.0.0.1:8090

# Terminal 2 — Frontend
cd mtg-app
npm run dev
# Par défaut : http://localhost:3000
```

### `.env.local` recommandé

```env
VITE_POCKETBASE_URL=http://127.0.0.1:8090
```

Sans cette variable, `src/services/pocketbase.ts` utilise une URL par défaut (IP locale ou HTTPS prod selon le contexte).

## PocketBase

### Collections requises

L'app attend au minimum : `users`, `collection`, `decks`, `wishlist`, `imports`, `legal`.

Configurez les **règles d'API** dans l'admin PocketBase pour que chaque utilisateur accède à ses données et que les admins puissent gérer les comptes.

### Premier admin

Voir [PROTOCOLE_ADMIN.md](../PROTOCOLE_ADMIN.md) et [POCKETBASE_ROLES_MIGRATION.md](./POCKETBASE_ROLES_MIGRATION.md).

## Prix MTGJSON

### Comportement par défaut (sans API backend)

- Au démarrage, l'app tente de charger les prix depuis le **cache IndexedDB**
- Si l'API backend (`VITE_PRICE_API_URL`) n'est pas configurée, un **fallback Scryfall** est utilisé en développement
- Message console typique : indiquant que l'API prix n'est pas disponible

### Avec API backend des prix

```env
VITE_PRICE_API_URL=https://votre-api-prix.example.com
```

Voir [MTGJSON_PRICES.md](./MTGJSON_PRICES.md) et [BACKEND_PRICES_API.md](./BACKEND_PRICES_API.md).

## Scan en local

- Route `/scan` accessible sans login (tests)
- **OpenCV.js** chargé depuis le CDN au premier usage
- **Tesseract.js** pour l'OCR
- En dev, proxy Vite `/scryfall-icons` pour les icônes SVG Scryfall (CORS)

La caméra nécessite **HTTPS ou localhost** selon le navigateur.

## PWA en développement

Le service worker est **désactivé** en dev (`devOptions.enabled: false` dans `vite.config.ts`). Pour tester la PWA :

```bash
npm run build
npm run preview
```

## Tests

```bash
npm test              # Unitaires (Jest)
npm run test:e2e      # E2E (Playwright — app + PocketBase requis)
npm run lint
```

## Dépannage

| Problème | Piste |
|----------|--------|
| Erreur CORS / Mixed Content | Front en HTTPS mais PocketBase en HTTP → utiliser HTTPS pour PB ou `.env.local` avec URL HTTP en local |
| Login échoue | Vérifier `VITE_POCKETBASE_URL` et que PocketBase tourne |
| Pas de lien Admin | Champ `roles` doit contenir `"admin"` sur l'utilisateur |
| Icônes sets en scan | Vérifier le proxy `/scryfall-icons` en dev |

Voir aussi [TROUBLESHOOTING.md](../TROUBLESHOOTING.md).
