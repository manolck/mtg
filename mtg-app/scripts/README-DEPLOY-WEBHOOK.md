# Déploiement depuis l’app (build + reload)

Permet de lancer le script de mise à jour du serveur depuis l’interface Admin (bouton « Lancer build et reload »).

L’authentification est la **session PocketBase admin** (`X-PocketBase-Auth`). Aucun secret de déploiement ne doit être mis dans une variable `VITE_*`.

## 1. Sur le serveur Linux

### Lancer le webhook

Le script `deploy-webhook-server.js` écoute sur `127.0.0.1` et exécute `mtg-app-update.sh`.

```bash
export POCKETBASE_URL="http://127.0.0.1:8090"
export PORT=9090
export SCRIPT_PATH="/usr/local/bin/mtg-app-update.sh"
# Optionnel : n'autoriser le CORS que si le SPA n'est pas same-origin
# export ALLOWED_ORIGIN="https://mtg-app.duckdns.org"
# Optionnel : secret injecté par nginx (jamais par le navigateur)
# export DEPLOY_TOKEN="…"

cd /var/www/mtg/mtg-app
node scripts/deploy-webhook-server.js
```

`POCKETBASE_URL` est **obligatoire**. Le webhook refuse toute requête sans token PocketBase d’un utilisateur au rôle `admin`.

Recommandation : service systemd. Exemple `/etc/systemd/system/mtg-deploy-webhook.service` :

```ini
[Unit]
Description=MTG App Deploy Webhook
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/mtg/mtg-app
EnvironmentFile=/etc/mtg/deploy-webhook.env
ExecStart=/usr/bin/node scripts/deploy-webhook-server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`/etc/mtg/deploy-webhook.env` (droits `600`, hors git) :

```
POCKETBASE_URL=http://127.0.0.1:8090
PORT=9090
SCRIPT_PATH=/usr/local/bin/mtg-app-update.sh
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mtg-deploy-webhook
```

### Nginx : exposer le webhook

```nginx
location /deploy {
    proxy_pass http://127.0.0.1:9090;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 120s;
    # Optionnel si DEPLOY_TOKEN est défini côté webhook :
    # proxy_set_header Authorization "Bearer votre_secret";
}
```

L’app appelle par exemple `https://votre-domaine.com/deploy` (POST). Preferer **same-origin** pour éviter le CORS.

### Droits sudo pour le script

```bash
sudo visudo
# www-data ALL=(ALL) NOPASSWD: /usr/local/bin/mtg-app-update.sh
```

## 2. Côté build de l’app

Au **build**, définir uniquement l’URL publique (pas de token) :

```bash
VITE_POCKETBASE_URL=https://pb.example.com VITE_DEPLOY_HOOK_URL=https://votre-domaine.com/deploy npm run build
```

Ou dans `.env.production` (ne pas committer s’il contient d’autres secrets) :

```
VITE_DEPLOY_HOOK_URL=https://votre-domaine.com/deploy
```

La sortie du script de déploiement n’est **pas** renvoyée au navigateur ; elle reste dans les logs du webhook.

## 3. Si le bouton Admin renvoie 401 après mise à jour

Si `DEPLOY_TOKEN` est encore défini sur le serveur, nginx doit l’injecter (`Authorization`). Sinon, retirer `DEPLOY_TOKEN` de l’environnement du webhook et ne garder que la vérif admin PocketBase.
