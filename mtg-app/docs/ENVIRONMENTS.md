# Configuration des environnements

## Vue d'ensemble

| Environnement | Usage | Frontend | Backend |
|---------------|-------|----------|---------|
| **Development** | Machine locale | `npm run dev` (port 3000) | PocketBase local (`8090`) |
| **Production** | Utilisateurs finaux | Build Vite + nginx (HTTPS) | PocketBase HTTPS (ex. `pb.mtg-app.duckdns.org`) |

## Variables d'environnement (frontend)

Définies au **build** (Vite). Préfixe obligatoire : `VITE_`.

| Variable | Requis | Description |
|----------|--------|-------------|
| `VITE_POCKETBASE_URL` | Recommandé | URL de l'instance PocketBase |
| `VITE_PRICE_API_URL` | Non | API backend pour mise à jour des prix MTGJSON |
| `VITE_SENTRY_DSN` | Non | DSN Sentry pour le monitoring |

### Exemple `.env.local` (développement)

```env
VITE_POCKETBASE_URL=http://127.0.0.1:8090
VITE_PRICE_API_URL=
VITE_SENTRY_DSN=
```

### Production

```env
VITE_POCKETBASE_URL=https://pb.mtg-app.duckdns.org
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
VITE_PRICE_API_URL=https://votre-api-prix.example.com
```

Si `VITE_POCKETBASE_URL` est absent, `src/services/pocketbase.ts` déduit une URL (HTTPS prod ou IP locale dev).

## Déploiement production (actuel)

Architecture documentée :

```
Navigateur (HTTPS)
    → nginx (mtg-app.duckdns.org) — SPA statique (dist/)
    → PocketBase (pb.mtg-app.duckdns.org) — API + auth
```

- Build : `npm run build` → dossier `dist/`
- Nginx front : [NGINX_CONFIG.md](../NGINX_CONFIG.md)
- PocketBase HTTPS : [POCKETBASE_HTTPS_SETUP.md](./POCKETBASE_HTTPS_SETUP.md)

## CI/CD (GitHub Actions)

### Actif

- **`ci.yml`** — Lint, tests unitaires, build sur `main` / `develop`

## CI/CD (GitHub Actions)

- **`ci.yml`** — Lint, tests unitaires, build sur `main` / `develop`

Les anciens workflows Firebase Hosting (`deploy-production`, `deploy-staging`, `firestore-backup`) ont été supprimés.

Déploiement production : build `npm run build` avec les variables `VITE_*`, puis publication du dossier `dist/` sur nginx.

## Secrets suggérés pour un futur workflow de déploiement

| Secret / variable | Staging | Production |
|-------------------|---------|------------|
| `VITE_POCKETBASE_URL` | URL PB staging | URL PB prod |
| `VITE_SENTRY_DSN` | DSN staging | DSN prod |
| `VITE_PRICE_API_URL` | API staging | API prod |

Déploiement du `dist/` : rsync, SCP, ou artifact GitHub Actions vers le serveur nginx.

## Rollback

1. Conserver les builds précédents (`dist/` tagués ou releases)
2. Redéployer l'artifact nginx
3. PocketBase : sauvegardes régulières de la base (`pb_data`)

## Références

- [DEVELOPMENT_LOCAL.md](./DEVELOPMENT_LOCAL.md)
- [LEGACY_FIREBASE.md](./LEGACY_FIREBASE.md)
