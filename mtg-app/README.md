# MTG Collection

Application web (PWA) pour gérer une collection Magic: The Gathering : import/export CSV, decks, wishlist, statistiques, scan de cartes, et **playtest multi-joueurs** (table + audio).

Stack : **React 19 / Vite 7 / TypeScript / Tailwind** + **PocketBase** (auth + données).

## Fonctionnalités

- **Authentification** — Email / mot de passe via [PocketBase](https://pocketbase.io/) (pas d’inscription publique dans l’UI)
- **Collection** — Import CSV (ManaBox et variantes), recherche, export (CSV, JSON, Deckbox, Moxfield)
- **Decks** — Création / édition, formats, visibilité publique / unlisted
- **Wishlist** — Liste de cartes avec recherche Scryfall
- **Statistiques** — Valeur estimée (MTGJSON / Scryfall), répartitions
- **Scan** — Détection OpenCV, OCR Tesseract, logos d’éditions Scryfall ; playtest physique via webcam + dHash d’illustration
- **Playtest** — Lobbies, table multi-joueurs, sync live (WebSocket `play-sync`), audio WebRTC (STUN/TURN)
- **Profil** — Avatar, pseudonyme, langue, mot de passe, suppression de compte
- **Administration** — Page `/admin` (rôle `admin`) : utilisateurs, déploiement optionnel
- **PWA** — Installable ; service worker en production uniquement
- **RGPD** — Consentement au premier login, politique de confidentialité

## Architecture

```
Navigateur (HTTPS)
    → nginx (mtg-app.duckdns.org)
         • SPA statique (dist/)
         • /play-ws → play-sync (:8091)
    → PocketBase (pb.mtg-app.duckdns.org) — API + auth + journal
    → play-sync — ordonne les actions de table + signaling RTC
    → coturn (turn.mtg-app.duckdns.org) — relais TURN (audio NAT difficiles)
```

- **Bootstrap / reload** d’une partie : PocketBase (`play_matches` + `play_match_actions`)
- **Live** : WebSocket `play-sync` (seq serveur). Sans `VITE_PLAY_WS_URL`, fallback HTTP + poll PocketBase
- **Audio** : WebRTC P2P ; PocketBase / play-sync ne transportent que le signaling

## Prérequis

- Node.js **20+** (18+ acceptable pour le front) et npm
- Instance **PocketBase** accessible
- Navigateur moderne

## Installation

```bash
cd mtg-app
npm install
cp .env.example .env.local
```

### Variables d’environnement (front, préfixe `VITE_`)

Définies au **build** (Vite). Sans `VITE_POCKETBASE_URL`, le dev et le build refusent de démarrer.

| Variable | Requis | Description |
|----------|--------|-------------|
| `VITE_POCKETBASE_URL` | **Oui** | URL PocketBase |
| `VITE_PRICE_API_URL` | Non | API backend prix MTGJSON |
| `VITE_SENTRY_DSN` | Non | Monitoring Sentry |
| `VITE_DEPLOY_HOOK_URL` | Non | Webhook admin « build + reload » (same-origin recommandé) |
| `VITE_ICE_SERVERS` | Non (recommandé prod) | JSON STUN/TURN WebRTC |
| `VITE_PLAY_WS_URL` | Non (recommandé prod) | WebSocket table (`ws://…` ou `wss://…/play-ws`) |

Exemple `.env.local` :

```env
VITE_POCKETBASE_URL=http://127.0.0.1:8090
VITE_PRICE_API_URL=
VITE_SENTRY_DSN=
VITE_DEPLOY_HOOK_URL=
VITE_ICE_SERVERS=
# VITE_PLAY_WS_URL=ws://127.0.0.1:8091/play-ws
VITE_PLAY_WS_URL=
```

Production (build) :

```env
VITE_POCKETBASE_URL=https://pb.mtg-app.duckdns.org
VITE_PLAY_WS_URL=wss://mtg-app.duckdns.org/play-ws
# VITE_ICE_SERVERS=[{"urls":["stun:stun.l.google.com:19302"]},{"urls":["turn:turn.mtg-app.duckdns.org:3478?transport=udp","turn:turn.mtg-app.duckdns.org:3478?transport=tcp"],"username":"mtgturn","credential":"CHANGE_ME"},{"urls":"turns:turn.mtg-app.duckdns.org:5349","username":"mtgturn","credential":"CHANGE_ME"}]
```

Secrets GitHub Actions (CI prod) : les mêmes `VITE_*` (voir workflows dans `.github/workflows/`).

## Développement local

```bash
# Terminal 1 — PocketBase
./pocketbase serve   # http://127.0.0.1:8090

# Terminal 2 — Front
npm run dev          # http://localhost:3000

# Terminal 3 (optionnel) — sync table WebSocket
cd server/play-sync && cp .env.example .env   # PB_URL=http://127.0.0.1:8090
npm install && npm run dev                    # :8091, path /play-ws
```

Puis dans `.env.local` : `VITE_PLAY_WS_URL=ws://127.0.0.1:8091/play-ws`.

- Caméra / micro : **HTTPS ou localhost**
- Service worker **désactivé** en `dev` ; pour tester la PWA : `npm run build && npm run preview`
- Collections play : `PB_ADMIN_EMAIL=… PB_ADMIN_PASSWORD=… npm run ensure-play-collections`

### Scripts npm utiles

| Commande | Description |
|----------|-------------|
| `npm run dev` / `build` / `preview` | Vite |
| `npm test` / `test:e2e` | Jest / Playwright |
| `npm run lint` | ESLint |
| `npm run ensure-play-collections` | Crée/maj collections play dans PB |
| `npm run generate-pwa-icons` | Icônes PWA |
| `npm run build-scryfall-dictionary` | Dictionnaire OCR |

## PocketBase

### Collections applicatives

Au minimum : `users`, collections / decks / wishlist / imports / legal (voir export `pocketbase_schema_export.json`).

**Playtest** : schéma dans [`pocketbase/play-collections.json`](pocketbase/play-collections.json) — `play_lobbies`, `play_seats`, `play_matches`, `play_match_actions`, `play_rtc_signals` (signaling legacy si pas de WS).

### Règles API

Source de vérité : [`pocketbase/api-rules.json`](pocketbase/api-rules.json).

PocketBase **ne les charge pas automatiquement**. Les coller dans Admin → chaque collection → API rules.

Points importants :

- Wishlist / decks / legal : accès propriétaire (ou decks publics selon `visibility`)
- `users.createRule` vide : pas d’inscription publique
- Play : hôte / joueurs via `playerIds` ; `play_match_actions` append-only
- Exports PB **0.22** (`schema`) ≠ **0.23+** (`fields`) — utiliser l’export `fields` ou `node scripts/convert-pb-schema-v23.mjs`

### Premier administrateur

1. PocketBase Admin (`/_/`) → `users` → New record  
2. `roles` (JSON) : `["user", "admin"]`  
3. Connexion à l’app → lien **Admin** → `/admin`  
4. Autres admins : page Admin → créer / modifier utilisateur et cocher Admin  

Compatibilité : l’ancien champ `role: "admin"` est encore accepté.

Si le lien Admin n’apparaît pas : vérifier `roles`, se reconnecter, vérifier `VITE_POCKETBASE_URL` et les règles API `users`.

### HTTPS PocketBase

En prod, PB doit être en HTTPS derrière nginx (sinon Mixed Content). Exemple d’hôte : `pb.mtg-app.duckdns.org` → proxy vers `127.0.0.1:8090`, certificat Let’s Encrypt.

## Déploiement production

### Front (SPA)

```bash
npm run build   # avec les VITE_* de prod
# Copier dist/ vers /var/www/mtg-app/
```

Nginx (HTTPS) — points clés :

```nginx
root /var/www/mtg-app;
location /assets/ { try_files $uri =404; expires 1y; }
location /play-ws {
    proxy_pass http://127.0.0.1:8091/play-ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
location / { try_files $uri $uri/ /index.html; }
```

Snippet prêt à coller : [`deploy/play-sync/nginx-play-ws.conf.snippet`](deploy/play-sync/nginx-play-ws.conf.snippet).

CI : workflows `.github/workflows/` (lint, tests, artifact `dist`).

### play-sync (WebSocket table)

```bash
cd server/play-sync
npm ci && npm run build
# Installer dist + deps prod sous /opt/mtg-play-sync
# Env : /etc/mtg-play-sync.env
#   PORT=8091
#   PB_URL=https://pb.mtg-app.duckdns.org
#   CORS_ORIGIN=https://mtg-app.duckdns.org
sudo cp deploy/play-sync/play-sync.service /etc/systemd/system/
sudo systemctl enable --now play-sync
curl -s http://127.0.0.1:8091/health
```

Build front avec `VITE_PLAY_WS_URL=wss://mtg-app.duckdns.org/play-ws`.

Test rapide : `npx wscat -c wss://mtg-app.duckdns.org/play-ws` puis `{"type":"ping"}`.

### coturn (TURN / audio)

Sans TURN, un joueur distant derrière NAT dur peut **recevoir** l’audio sans **envoyer** (`packetsSent ≈ 0`).

1. `sudo apt install coturn` — activer dans `/etc/default/coturn`  
2. Copier [`deploy/coturn/turnserver.conf.example`](deploy/coturn/turnserver.conf.example) → `/etc/turnserver.conf`  
3. Renseigner `external-ip=IP_PUBLIQUE/IP_LAN`, `user=mtgturn:…`, `realm`  
4. Ports : **3478** UDP/TCP, **5349** TCP (TURNS), **49152–49200** UDP  
5. DNS `turn.mtg-app.duckdns.org` → IP publique  
6. Cert TLS recommandé pour `turns:`  
7. Rebuild front avec `VITE_ICE_SERVERS` (credentials visibles dans le bundle — utilisateur dédié)  
8. Vérifier [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) : candidats `relay`

### Webhook déploiement (optionnel)

Depuis l’admin app (« Lancer build et reload ») :

- Script : `scripts/deploy-webhook-server.js` (écoute `127.0.0.1`, auth session PocketBase **admin**)
- Env serveur : `POCKETBASE_URL`, `PORT=9090`, `SCRIPT_PATH` → script shell de update
- **Aucun secret de deploy dans `VITE_*`** — seulement `VITE_DEPLOY_HOOK_URL` (URL du webhook)
- Nginx peut proxy `/deploy` vers `127.0.0.1:9090`

## Import CSV

Colonnes typiques : **Name** (requis), Quantity, Set code, Set name, Collector number, Foil, Rarity, Condition, Language.

Formats simples sans en-têtes : `Lightning Bolt` ; `Lightning Bolt, 4` ; `Lightning Bolt, 4, M21`.

Séparateurs : virgule, point-virgule, tabulation.

## Structure du dépôt

```
mtg-app/
├── src/                 # App React
├── server/play-sync/    # WebSocket sync table
├── deploy/              # Exemples systemd / nginx / coturn
├── pocketbase/          # Schémas, règles API, migrations
├── e2e/                 # Playwright
├── public/              # Assets, dictionnaires
├── scripts/             # Admin, scraping, deploy webhook, OCR
└── .env.example
```

## Tests

```bash
npm test                 # Unitaires (Jest)
npm run test:e2e         # E2E (Playwright — app + PB requis)
cd server/play-sync && npm test
```

## Sécurité / RGPD / Sentry

- HTTPS front + PB en prod ; limiter l’exposition de `/_/` PocketBase
- Règles API appliquées et alignées avec `pocketbase/api-rules.json`
- Mots de passe forts ; peu de comptes admin ; backups de `pb_data`
- Consentement RGPD au login ; page politique de confidentialité
- Sentry optionnel via `VITE_SENTRY_DSN` (build prod)
- Respecter les [conditions Scryfall](https://scryfall.com/docs/api)

## APIs externes

| Source | Usage |
|--------|--------|
| Scryfall | Cartes, recherche, icônes d’éditions |
| MTGJSON | Prix (cache IndexedDB + API optionnelle) |
| Magic Corporation | Fallback noms OCR |

## Dépannage rapide

| Problème | Piste |
|----------|--------|
| App ne démarre pas | `VITE_POCKETBASE_URL` manquant |
| Mixed Content | PB en HTTP alors que le front est HTTPS |
| Pas de lien Admin | `roles` sans `"admin"` ; se reconnecter |
| Table désync / lente | `VITE_PLAY_WS_URL` + play-sync up ; sinon poll 1,5 s |
| Audio à sens unique | coturn + `VITE_ICE_SERVERS` + ports UDP |
| Caméra refusée | Pas en localhost/HTTPS |

## Licence

Ce projet est fourni tel quel, sans garantie.
