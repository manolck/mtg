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
| `VITE_POCKETBASE_URL` | **Oui** | URL de l'instance PocketBase |
| `VITE_PRICE_API_URL` | Non | API backend pour mise à jour des prix MTGJSON |
| `VITE_SENTRY_DSN` | Non | DSN Sentry pour le monitoring |
| `VITE_ICE_SERVERS` | Non (recommandé en prod) | JSON STUN/TURN WebRTC — voir [WEBRTC_TURN_SETUP.md](./WEBRTC_TURN_SETUP.md) |

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
# Audio playtest distant (coturn) — docs/WEBRTC_TURN_SETUP.md
# VITE_ICE_SERVERS=[{"urls":["stun:stun.l.google.com:19302"]},{"urls":["turn:turn.mtg-app.duckdns.org:3478?transport=udp","turn:turn.mtg-app.duckdns.org:3478?transport=tcp"],"username":"mtgturn","credential":"CHANGE_ME"},{"urls":"turns:turn.mtg-app.duckdns.org:5349","username":"mtgturn","credential":"CHANGE_ME"}]
```

Si `VITE_POCKETBASE_URL` est absent, `vite` et `src/services/pocketbase.ts` échouent (plus de fallback duckdns / IP LAN).

## Déploiement production (actuel)

Architecture documentée :

```
Navigateur (HTTPS)
    → nginx (mtg-app.duckdns.org) — SPA statique (dist/)
    → PocketBase (pb.mtg-app.duckdns.org) — API + auth
    → coturn (turn.mtg-app.duckdns.org) — relais WebRTC audio (optionnel mais requis pour NAT difficiles)
```

- Build : `npm run build` → dossier `dist/`
- Nginx front : [NGINX_CONFIG.md](../NGINX_CONFIG.md)
- PocketBase HTTPS : [POCKETBASE_HTTPS_SETUP.md](./POCKETBASE_HTTPS_SETUP.md)
- WebRTC TURN : [WEBRTC_TURN_SETUP.md](./WEBRTC_TURN_SETUP.md)

## CI/CD (GitHub Actions)

Workflows à la **racine du dépôt** : `.github/workflows/` (le repo Git est `mtg/`, l'app dans `mtg-app/`).

| Workflow | Déclencheur | Rôle |
|----------|-------------|------|
| **`ci.yml`** | PR + push `main` / `develop` | Lint, tests, build, artifact `dist-{sha}` (7 jours) |
| **`build-production.yml`** | Push `main`, tags `v*`, manuel | Lint, tests, build prod, artifact `mtg-app-dist` (30 jours) |

### Secrets GitHub (Settings → Secrets → Actions)

| Secret | Requis | Description |
|--------|--------|-------------|
| `VITE_POCKETBASE_URL` | **Oui** (prod) | URL PocketBase injectée au build |
| `VITE_PRICE_API_URL` | Non | API prix MTGJSON |
| `VITE_SENTRY_DSN` | Non | Monitoring Sentry |
| `VITE_ICE_SERVERS` | Non (recommandé) | JSON STUN/TURN pour audio playtest |

Pour `build-production.yml`, configurez l’environnement **production** dans GitHub (optionnel) pour isoler les secrets prod.

En CI sur les PR, si le secret `VITE_POCKETBASE_URL` est absent, le build utilise `http://127.0.0.1:8090` uniquement pour compiler l'artifact (ne pas déployer cet artifact). Le workflow production **échoue** si le secret est vide.

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
