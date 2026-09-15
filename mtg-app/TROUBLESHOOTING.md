# Guide de dépannage

Problèmes courants avec l'application MTG Collection (stack **PocketBase** + React/Vite).

## Connexion impossible

### Symptômes

- Erreur à la connexion sur `/login`
- Requêtes vers PocketBase en échec dans la console (F12)

### Solutions

1. Vérifier que PocketBase tourne (`http://127.0.0.1:8090` en local)
2. Vérifier `.env.local` :
   ```env
   VITE_POCKETBASE_URL=http://127.0.0.1:8090
   ```
3. Redémarrer `npm run dev` après modification de `.env.local`
4. Vérifier que l'utilisateur existe dans PocketBase Admin → `users`

## Mixed Content / CORS (production HTTPS)

### Symptômes

```
Mixed Content: The page at 'https://...' was loaded over HTTPS, but requested an insecure resource 'http://...'
```

Le front est en **HTTPS** mais PocketBase est appelé en **HTTP**.

### Solutions

1. Exposer PocketBase en HTTPS (nginx + Let's Encrypt)
2. Définir `VITE_POCKETBASE_URL=https://pb.votre-domaine.example` au build
3. Voir [docs/POCKETBASE_HTTPS_SETUP.md](./docs/POCKETBASE_HTTPS_SETUP.md)

## Lien « Admin » absent

1. Dans PocketBase Admin → `users` → votre compte
2. Champ `roles` doit contenir `"admin"` :
   ```json
   ["user", "admin"]
   ```
3. Se déconnecter et se reconnecter
4. Voir [PROTOCOLE_ADMIN.md](./PROTOCOLE_ADMIN.md)

## Import CSV lent ou en échec

1. Vérifier la connexion réseau (appels Scryfall)
2. Réduire la taille du fichier pour tester
3. Consulter le rapport d'import dans **Profil** → Imports
4. Vérifier les règles PocketBase sur la collection `collection` et `imports`

## Prix / statistiques à 0

1. En dev sans `VITE_PRICE_API_URL`, fallback Scryfall (moins complet que MTGJSON)
2. Attendre le chargement initial MTGJSON (IndexedDB)
3. Voir [docs/MTGJSON_PRICES.md](./docs/MTGJSON_PRICES.md)

## Scan : caméra ne démarre pas

1. Utiliser **localhost** ou **HTTPS** (requis par les navigateurs pour `getUserMedia`)
2. Autoriser l'accès caméra dans le navigateur
3. Sur mobile : préférer Chrome (Android) ou Safari (iOS)

## Scan : icônes d'édition ne s'affichent pas

En développement, le proxy Vite `/scryfall-icons` doit être actif (`vite.config.ts`). En production, les icônes Scryfall sont chargées directement si CORS le permet.

## PWA : pas de mise à jour / hors ligne

- Le service worker n'est actif qu'en **production** (`npm run build` + `npm run preview` ou déploiement nginx)
- En dev, PWA désactivée volontairement

## Build échoue

```bash
npm run lint
npm test
npm run build
```

Vérifier TypeScript et variables d'environnement au build.

## Firebase Storage (historique)

L'application n'utilise plus Firebase Storage pour les avatars (avatars emoji en base). Si vous consultez d'anciennes notes sur les erreurs CORS Firebase Storage, voir [docs/LEGACY_FIREBASE.md](./docs/LEGACY_FIREBASE.md).

## Aide supplémentaire

- [docs/DEVELOPMENT_LOCAL.md](./docs/DEVELOPMENT_LOCAL.md)
- [docs/SECURITY.md](./docs/SECURITY.md)
- [docs/README.md](./docs/README.md)
