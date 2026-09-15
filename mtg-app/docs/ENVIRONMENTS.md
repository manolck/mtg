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

Workflows à la **racine du dépôt** : `.github/workflows/` (le repo Git est `mtg/`, l'app dans `mtg-app/`).

| Workflow | Déclencheur | Rôle |
|----------|-------------|------|
| **`ci.yml`** | PR + push `main` / `develop` | Lint, tests, build, artifact `dist-{sha}` (7 jours) |
| **`build-production.yml`** | Push `main`, tags `v*`, manuel | Lint, tests, build prod, artifact `mtg-app-dist` (30 jours) |

### Secrets GitHub (Settings → Secrets → Actions)

| Secret | Requis | Description |
|--------|--------|-------------|
| `VITE_POCKETBASE_URL` | Recommandé (prod) | URL PocketBase injectée au build |
| `VITE_PRICE_API_URL` | Non | API prix MTGJSON |
| `VITE_SENTRY_DSN` | Non | Monitoring Sentry |

Pour `build-production.yml`, configurez l’environnement **production** dans GitHub (optionnel) pour isoler les secrets prod.

En CI sur les PR, si `VITE_POCKETBASE_URL` est absent, le build utilise `https://pb.mtg-app.duckdns.org` par défaut.

### Déploiement manuel après build

1. Télécharger l’artifact **mtg-app-dist** depuis l’onglet Actions
2. Copier le contenu vers le répertoire nginx (ex. `/var/www/mtg-app/`)
3. Vérifier la config nginx : [NGINX_CONFIG.md](../NGINX_CONFIG.md)

Les anciens workflows Firebase ont été supprimés.

## Rollback

1. Conserver les builds précédents (`dist/` tagués ou releases)
2. Redéployer l'artifact nginx
3. PocketBase : sauvegardes régulières de la base (`pb_data`)

## Références

- [DEVELOPMENT_LOCAL.md](./DEVELOPMENT_LOCAL.md)
- [LEGACY_FIREBASE.md](./LEGACY_FIREBASE.md)
