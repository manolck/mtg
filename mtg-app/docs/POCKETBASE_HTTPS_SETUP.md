# Configuration HTTPS pour PocketBase

## Problème

L'application est servie en HTTPS (`https://mtg-app.duckdns.org`) mais PocketBase est configuré en HTTP (`http://192.168.1.62:8090`). Les navigateurs modernes bloquent les requêtes HTTP depuis une page HTTPS (Mixed Content Policy).

## Solutions

### Solution 1 : Reverse Proxy avec Nginx (Recommandé)

#### Étape 1 : Installer Nginx sur le Raspberry Pi

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
```

#### Étape 2 : Configurer Nginx pour PocketBase

Créer le fichier `/etc/nginx/sites-available/pocketbase` :

```nginx
server {
    listen 80;
    server_name pb.mtg-app.duckdns.org;  # Ou votre sous-domaine

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support (si nécessaire)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### Étape 3 : Activer la configuration

```bash
sudo ln -s /etc/nginx/sites-available/pocketbase /etc/nginx/sites-enabled/
sudo nginx -t  # Vérifier la configuration
sudo systemctl reload nginx
```

#### Étape 4 : Obtenir un certificat SSL avec Let's Encrypt

```bash
sudo certbot --nginx -d pb.mtg-app.duckdns.org
```

Certbot va automatiquement :
- Obtenir un certificat SSL
- Configurer HTTPS dans Nginx
- Configurer le renouvellement automatique

#### Étape 5 : Mettre à jour la configuration de l'application

Dans votre fichier `.env` ou variables d'environnement de production :

```env
VITE_POCKETBASE_URL=https://pb.mtg-app.duckdns.org
```

### Solution 2 : Reverse Proxy avec Caddy (Plus simple)

Caddy configure automatiquement HTTPS avec Let's Encrypt.

#### Étape 1 : Installer Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

#### Étape 2 : Configurer Caddy

Créer le fichier `/etc/caddy/Caddyfile` :

```
pb.mtg-app.duckdns.org {
    reverse_proxy localhost:8090
}
```

#### Étape 3 : Démarrer Caddy

```bash
sudo systemctl enable caddy
sudo systemctl start caddy
```

Caddy va automatiquement :
- Obtenir un certificat SSL
- Configurer HTTPS
- Renouveler le certificat automatiquement

#### Étape 4 : Mettre à jour la configuration de l'application

```env
VITE_POCKETBASE_URL=https://pb.mtg-app.duckdns.org
```

### Solution 3 : Utiliser le même domaine avec un chemin (Sous-chemin)

Si vous préférez utiliser le même domaine (`mtg-app.duckdns.org`) avec un sous-chemin (`/api/pocketbase`), vous pouvez configurer Nginx ainsi :

```nginx
server {
    listen 443 ssl http2;
    server_name mtg-app.duckdns.org;

    # Configuration SSL (gérée par Certbot)
    ssl_certificate /etc/letsencrypt/live/mtg-app.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mtg-app.duckdns.org/privkey.pem;

    # Application React (Vite)
    location / {
        # Configuration pour votre application React
        # (selon votre configuration actuelle)
    }

    # PocketBase sous /api/pocketbase
    location /api/pocketbase/ {
        rewrite ^/api/pocketbase/(.*) /$1 break;
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

**Note importante** : PocketBase doit être configuré pour accepter les requêtes avec le préfixe `/api/pocketbase`. Vous devrez peut-être modifier la configuration de PocketBase ou utiliser un middleware.

### Solution 4 : Configuration directe HTTPS de PocketBase (Avancé)

PocketBase peut être configuré pour utiliser HTTPS directement, mais cela nécessite :
- Un certificat SSL
- Configuration du serveur HTTP de PocketBase

Cette solution est plus complexe et moins recommandée que les reverse proxies.

## Configuration de l'application

### Variables d'environnement

Mettez à jour votre fichier `.env.production` ou vos variables d'environnement de déploiement :

```env
VITE_POCKETBASE_URL=https://pb.mtg-app.duckdns.org
```

Ou si vous utilisez un sous-chemin :

```env
VITE_POCKETBASE_URL=https://mtg-app.duckdns.org/api/pocketbase
```

### Détection automatique du protocole

Vous pouvez également modifier `src/services/pocketbase.ts` pour détecter automatiquement le protocole :

```typescript
// src/services/pocketbase.ts
import PocketBase from 'pocketbase';

// Détecter le protocole basé sur l'environnement
const getPocketBaseUrl = () => {
  const envUrl = import.meta.env.VITE_POCKETBASE_URL;
  if (envUrl) {
    return envUrl;
  }
  
  // En production, utiliser HTTPS si la page est en HTTPS
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return 'https://pb.mtg-app.duckdns.org';
  }
  
  // En développement, utiliser HTTP local
  return 'http://192.168.1.62:8090';
};

const POCKETBASE_URL = getPocketBaseUrl();

export const pb = new PocketBase(POCKETBASE_URL);
pb.autoCancellation(false);

export default pb;
```

## Vérification

1. **Vérifier que PocketBase est accessible en HTTPS** :
   ```bash
   curl https://pb.mtg-app.duckdns.org/api/health
   ```

2. **Vérifier dans la console du navigateur** :
   - Ouvrez les DevTools (F12)
   - Allez dans l'onglet Network
   - Rechargez la page
   - Vérifiez que toutes les requêtes vers PocketBase utilisent HTTPS

3. **Tester l'authentification** :
   - Essayez de vous connecter
   - Vérifiez qu'il n'y a plus d'erreur "Mixed Content"

## Recommandation

**Solution recommandée** : Utiliser **Caddy** (Solution 2) car :
- Configuration automatique de HTTPS
- Renouvellement automatique des certificats
- Configuration simple
- Support WebSocket natif

## Dépannage

### Erreur "502 Bad Gateway"
- Vérifiez que PocketBase est en cours d'exécution : `sudo systemctl status pocketbase`
- Vérifiez les logs Nginx/Caddy : `sudo journalctl -u nginx` ou `sudo journalctl -u caddy`

### Erreur "Certificate verification failed"
- Vérifiez que le certificat SSL est valide : `sudo certbot certificates`
- Vérifiez que le domaine pointe vers votre Raspberry Pi

### Erreur "Connection refused"
- Vérifiez que PocketBase écoute sur `127.0.0.1:8090` (et non `0.0.0.0:8090`)
- Vérifiez les règles de pare-feu
