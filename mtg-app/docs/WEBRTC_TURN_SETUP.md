# WebRTC TURN (coturn) — audio playtest

## Pourquoi

L’audio de la table est **pair-à-pair** (WebRTC). PocketBase ne relaie que le **signaling** (`play_rtc_signals`), pas les paquets micro.

Sans **TURN**, seuls STUN publics sont utilisés. Un joueur **distant** derrière CGNAT / NAT symétrique peut **recevoir** l’audio du joueur en LAN sans **envoyer** (`packetsSent ≈ 0`). Coturn sur la **même machine que PocketBase** corrige ce cas.

## Architecture

```
Navigateur distant ──UDP/TCP──► coturn (turn.mtg-app.duckdns.org)
Navigateur LAN     ──UDP/TCP──► coturn
PocketBase         ──signaling──► navigateurs (inchangé)
```

Hostname recommandé : `turn.mtg-app.duckdns.org` (même IP publique que le serveur PB / nginx).

## 1. Installer coturn

Debian / Ubuntu :

```bash
sudo apt update
sudo apt install coturn
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
```

## 2. Configurer

```bash
sudo cp /path/to/mtg-app/deploy/coturn/turnserver.conf.example /etc/turnserver.conf
sudo nano /etc/turnserver.conf
```

Renseigner au minimum :

| Champ | Valeur |
|-------|--------|
| `external-ip` | `IP_PUBLIQUE/IP_LAN` (ex. `203.0.113.10/192.168.1.62`) |
| `user` | `mtgturn:MOT_DE_PASSE_FORT` |
| `realm` | `mtg-app.duckdns.org` |

Activer TLS (`cert` / `pkey`) une fois le certificat Let’s Encrypt prêt (voir §5).

```bash
sudo systemctl enable --now coturn
sudo systemctl status coturn
```

## 3. Pare-feu / box

Ouvrir / forwarder vers la machine coturn :

| Port | Proto | Rôle |
|------|-------|------|
| **3478** | UDP + TCP | TURN |
| **5349** | TCP | TURNS (TLS) |
| **49152–49200** | UDP | Relais média |

Sur une box domestique : règles de redirection NAT vers l’IP LAN du serveur.

## 4. DNS DuckDNS

Créer / mettre à jour un enregistrement **`turn`** (ou `turn.mtg-app`) pointant vers l’**IP publique** du serveur — même IP que `pb.mtg-app.duckdns.org` / `mtg-app.duckdns.org` si tout est sur une seule machine.

Vérifier :

```bash
dig +short turn.mtg-app.duckdns.org
```

## 5. Certificat TLS (recommandé pour `turns:`)

Avec certbot (exemple standalone ou nginx déjà en place) :

```bash
sudo certbot certonly --nginx -d turn.mtg-app.duckdns.org
# ou réutiliser un certificat wildcard / multi-SAN déjà présent
```

Décommenter dans `turnserver.conf` :

```
cert=/etc/letsencrypt/live/turn.mtg-app.duckdns.org/fullchain.pem
pkey=/etc/letsencrypt/live/turn.mtg-app.duckdns.org/privkey.pem
```

```bash
sudo systemctl restart coturn
```

## 6. Tester les candidats `relay`

1. Ouvrir [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/).
2. Ajouter les serveurs ICE (même JSON que `VITE_ICE_SERVERS`, voir ci-dessous).
3. Lancer le test : des lignes **`relay`** doivent apparaître.

En CLI (si `turnutils_uclient` est installé avec coturn) :

```bash
turnutils_uclient -v -u mtgturn -w 'MOT_DE_PASSE' turn.mtg-app.duckdns.org
```

## 7. Brancher le frontend

Dans le `.env` de **build production** (secret GitHub Actions ou fichier de build) :

```env
VITE_ICE_SERVERS=[{"urls":["stun:stun.l.google.com:19302"]},{"urls":["turn:turn.mtg-app.duckdns.org:3478?transport=udp","turn:turn.mtg-app.duckdns.org:3478?transport=tcp"],"username":"mtgturn","credential":"MOT_DE_PASSE"},{"urls":"turns:turn.mtg-app.duckdns.org:5349","username":"mtgturn","credential":"MOT_DE_PASSE"}]
```

Puis **rebuild + redéployer** le front (`npm run build`). Les variables `VITE_*` sont injectées au build, pas au runtime nginx.

Vérifier dans la console navigateur : un log du type `WebRTC ICE: TURN configured` au démarrage d’une table.

### Sécurité des credentials

Les identifiants TURN dans `VITE_ICE_SERVERS` sont **visibles dans le bundle client** (normal pour l’auth TURN statique WebRTC). Utiliser un utilisateur dédié coturn, mot de passe rotatif, et ne pas réutiliser un compte système. Des credentials à durée limitée (REST API coturn) peuvent être ajoutés plus tard.

## 8. Validation sur une table

1. Joueur A en LAN (même réseau que le serveur).
2. Joueur B distant (autre réseau / 4G).
3. Les deux autorisent le micro.
4. Sur B, survoler 🎤 : **Paquets envoyés** et **Paquets reçus** doivent monter.
5. Si seulement « reçus » monte, TURN n’est pas atteint (ports DNS/conf) — l’UI affiche un hint NAT.

## Fichiers liés

- Exemple conf : [`deploy/coturn/turnserver.conf.example`](../deploy/coturn/turnserver.conf.example)
- Env : [`.env.example`](../.env.example), [`ENVIRONMENTS.md`](./ENVIRONMENTS.md)
- Code ICE : `src/services/playRtcService.ts` (`getIceServers`)
- Signaling PB : [`POCKETBASE_API_RULES.md`](./POCKETBASE_API_RULES.md) (`play_rtc_signals`)
