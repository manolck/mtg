# Déploiement depuis l’app (build + reload)

Permet de lancer le script de mise à jour du serveur depuis l’interface Admin (bouton « Lancer build et reload »).

## 1. Sur le serveur Linux

### Lancer le webhook

Le script `deploy-webhook-server.js` doit tourner sur le serveur et exécuter `mtg-app-update.sh` au moment où il reçoit un POST avec le bon token.

```bash
# Variables d'environnement
export DEPLOY_TOKEN="votre_secret_long_et_aleatoire"
export PORT=9090
export SCRIPT_PATH="/usr/local/bin/mtg-app-update.sh"

# Lancer (avec node)
cd /var/www/mtg/mtg-app
node scripts/deploy-webhook-server.js
```

Recommandation : créer un service systemd pour qu’il démarre au boot et redémarre en cas de crash.

Exemple `/etc/systemd/system/mtg-deploy-webhook.service` :

```ini
[Unit]
Description=MTG App Deploy Webhook
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/mtg/mtg-app
Environment=DEPLOY_TOKEN=votre_secret
Environment=PORT=9090
Environment=SCRIPT_PATH=/usr/local/bin/mtg-app-update.sh
ExecStart=/usr/bin/node scripts/deploy-webhook-server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Puis :

```bash
sudo systemctl daemon-reload
sudo systemctl enable mtg-deploy-webhook
sudo systemctl start mtg-deploy-webhook
```

### Nginx : exposer le webhook

Le webhook écoute sur `127.0.0.1:9090`. Il faut que Nginx envoie une URL dédiée vers ce port (et éventuellement limiter par IP ou garder le token comme seule protection).

Exemple dans un `server` ou dans un `location` :

```nginx
location /deploy {
    proxy_pass http://127.0.0.1:9090;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

L’app appellera par exemple : `https://votre-domaine.com/deploy` (en POST).

### Droits sudo pour le script

Le script `mtg-app-update.sh` est lancé avec `sudo`. Vérifier que l’utilisateur qui exécute le webhook (ex. `www-data`) peut lancer ce script sans mot de passe :

```bash
sudo visudo
# Ajouter (remplacer www-data si besoin) :
www-data ALL=(ALL) NOPASSWD: /usr/local/bin/mtg-app-update.sh
```

## 2. Côté build de l’app (variables Vite)

Au moment du **build** (`npm run build`), définir :

- `VITE_DEPLOY_HOOK_URL` : URL complète appelée en POST (ex. `https://votre-domaine.com/deploy`).
- `VITE_DEPLOY_TOKEN` : même valeur que `DEPLOY_TOKEN` sur le serveur.

Exemple :

```bash
VITE_DEPLOY_HOOK_URL=https://votre-domaine.com/deploy VITE_DEPLOY_TOKEN=votre_secret npm run build
```

Ou dans un fichier `.env.production` (ne pas le committer si il contient le token) :

```
VITE_DEPLOY_HOOK_URL=https://votre-domaine.com/deploy
VITE_DEPLOY_TOKEN=votre_secret
```

Après un build avec ces variables, la section « Mise à jour du serveur » apparaît dans la page Admin et le bouton envoie la requête au webhook. Le résultat (succès ou erreur + sortie du script) s’affiche sous le bouton.
