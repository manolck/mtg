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

### Réserver /deploy aux administrateurs

Par défaut, toute requête POST avec le bon `DEPLOY_TOKEN` déclenche le déploiement. Pour que **seuls les comptes admin** (rôle `admin` dans PocketBase) puissent lancer le déploiement :

1. **Sur le serveur** : définir la variable `POCKETBASE_URL` (URL de base de votre instance PocketBase, sans slash final). Le webhook exige alors le header `X-PocketBase-Auth` (token de session) et appelle PocketBase pour vérifier que l'utilisateur a le rôle `admin`.

```bash
export POCKETBASE_URL="https://pb.mtg-app.duckdns.org"
```

Dans le fichier d'env (ex. `/etc/mtg/deploy-webhook.env`) ou le service systemd, ajouter :

```
POCKETBASE_URL=https://pb.mtg-app.duckdns.org
```

2. **Côté app** : rien à faire. Lors du clic sur « Lancer build et reload », l'app envoie déjà le token PocketBase dans le header `X-PocketBase-Auth` (si l'utilisateur est connecté).

Comportement :

- Si `POCKETBASE_URL` **n'est pas** défini : seul le token de déploiement est vérifié (comportement actuel).
- Si `POCKETBASE_URL` **est** défini : le token de déploiement **et** un token PocketBase valide avec rôle `admin` sont requis. Sinon, le webhook répond 403 (ex. « Accès réservé aux administrateurs »).

Le serveur webhook doit pouvoir joindre PocketBase (réseau / firewall). Utiliser l'URL interne (ex. `http://127.0.0.1:8090`) si PocketBase est sur la même machine.

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

**Important :** ne pas committer ce fichier (voir section 3 ci-dessous).

Après un build avec ces variables, la section « Mise à jour du serveur » apparaît dans la page Admin et le bouton envoie la requête au webhook. Le résultat (succès ou erreur + sortie du script) s’affiche sous le bouton.

## 3. Garder le token en protection

### Ne jamais committer le token

- Les fichiers `.env`, `.env.production`, `.env.*.local` sont dans `.gitignore` : **ne pas les retirer** et ne jamais committer un fichier qui contient `VITE_DEPLOY_TOKEN` ou `DEPLOY_TOKEN`.
- Pour le build en CI/CD : injecter les variables au moment du build (secrets du CI) au lieu d'un fichier `.env.production` versionné.

### Sur le serveur (webhook)

- **Variables d'environnement** : ne pas mettre le token en clair dans un fichier de config versionné. Utiliser un fichier réservé au serveur, hors dépôt, avec droits restreints :

```bash
# Créer un fichier accessible uniquement par root
sudo nano /etc/mtg/deploy-webhook.env
# Contenu (exemple) :
# DEPLOY_TOKEN=votre_secret_long_et_aleatoire
# PORT=9090
# SCRIPT_PATH=/usr/local/bin/mtg-app-update.sh

sudo chmod 600 /etc/mtg/deploy-webhook.env
sudo chown root:root /etc/mtg/deploy-webhook.env
```

- **Systemd** : charger le token depuis ce fichier au lieu de `Environment=` en clair :

```ini
[Service]
User=www-data
WorkingDirectory=/var/www/mtg/mtg-app
EnvironmentFile=/etc/mtg/deploy-webhook.env
ExecStart=/usr/bin/node scripts/deploy-webhook-server.js
Restart=on-failure
```

Ainsi le token n'apparaît pas dans `systemctl show` ni dans les listings de processus.

### Côté app (build / navigateur)

- **Limitation** : les variables `VITE_*` sont intégrées au bundle au moment du build. Quiconque peut charger l'app peut donc voir `VITE_DEPLOY_TOKEN` dans le code source du JS. La « protection » repose sur :
  1. **Accès réservé à la page Admin** : seuls les utilisateurs authentifiés avec les droits admin peuvent voir et utiliser le bouton de déploiement. Pour renforcer la sécurité, définir `POCKETBASE_URL` sur le serveur webhook : le endpoint `/deploy` n'acceptera alors que les requêtes accompagnées d'un token PocketBase valide avec rôle admin (voir « Réserver /deploy aux administrateurs » ci-dessus).
  2. **Token long et aléatoire** : difficile à deviner même s'il est exposé (ex. `openssl rand -hex 32`).
  3. **Optionnel** : en Nginx, restreindre l'URL `/deploy` par IP (ex. plage du bureau) en plus du token.

### Générer un token fort

```bash
openssl rand -hex 32
```

Utiliser la même valeur pour `DEPLOY_TOKEN` sur le serveur et `VITE_DEPLOY_TOKEN` au build.
