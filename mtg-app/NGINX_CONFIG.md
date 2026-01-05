# Configuration nginx pour Vite en HTTPS

Ce document décrit la configuration nginx nécessaire pour exposer votre application Vite (qui tourne sur le port 3000) via HTTPS.

## Architecture

```
Client (HTTPS) → nginx (port 443) → Vite (port 3000, HTTP interne)
```

## Configuration nginx

### 1. Configuration complète

Créez ou modifiez votre fichier de configuration nginx (par exemple `/etc/nginx/sites-available/mtg-app`) :

```nginx
# Redirection HTTP vers HTTPS
server {
    listen 80;
    server_name votre-domaine.com;
    
    # Redirection automatique vers HTTPS
    return 301 https://$server_name$request_uri;
}

# Configuration HTTPS principale
server {
    listen 443 ssl http2;
    server_name votre-domaine.com;

    # Certificats SSL (Let's Encrypt ou autre)
    ssl_certificate /etc/letsencrypt/live/votre-domaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/votre-domaine.com/privkey.pem;
    
    # Configuration SSL recommandée
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Headers de sécurité
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Taille maximale des uploads (si nécessaire pour Firebase Storage)
    client_max_body_size 10M;

    # Proxy vers Vite sur le port 3000
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        
        # Headers essentiels pour le proxy
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # Support des WebSockets (essentiel pour le HMR de Vite)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts pour les WebSockets
        proxy_read_timeout 86400;
        proxy_connect_timeout 86400;
        
        # Buffer settings
        proxy_buffering off;
    }

    # Support spécifique pour le HMR WebSocket de Vite
    location /__vite_ping {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### 2. Points importants

#### WebSockets (HMR)
Les lignes suivantes sont **essentielles** pour le Hot Module Replacement (HMR) de Vite :
```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

#### Headers X-Forwarded-*
Ces headers permettent à Vite de connaître l'URL réelle utilisée par le client (HTTPS) :
```nginx
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
```

## Configuration Vite

Assurez-vous que votre `vite.config.ts` est configuré correctement :

```typescript
export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',
    }),
  ],
  server: {
    port: 3000,
    strictPort: false,
    host: true,  // Important : accepter les connexions externes
  },
})
```

## Installation et déploiement

### 1. Obtenir un certificat SSL (Let's Encrypt)

```bash
# Installer certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtenir un certificat pour votre domaine
sudo certbot --nginx -d votre-domaine.com

# Le certificat sera automatiquement configuré et renouvelé
```

### 2. Créer le fichier de configuration

```bash
# Créer le fichier de configuration
sudo nano /etc/nginx/sites-available/mtg-app

# Copier la configuration ci-dessus (en remplaçant votre-domaine.com)
# Sauvegarder avec Ctrl+X, puis Y, puis Entrée
```

### 3. Activer la configuration

```bash
# Créer le lien symbolique pour activer le site
sudo ln -s /etc/nginx/sites-available/mtg-app /etc/nginx/sites-enabled/

# Tester la configuration nginx
sudo nginx -t

# Si le test réussit, recharger nginx
sudo nginx -s reload

# Ou redémarrer nginx
sudo systemctl restart nginx
```

### 4. Vérifier que Vite tourne

```bash
# Vérifier que Vite écoute sur le port 3000
netstat -tlnp | grep 3000
# ou
ss -tlnp | grep 3000

# Si Vite n'est pas lancé, le démarrer
cd mtg-app
npm run dev
```

## Configuration Firebase Auth

Si vous utilisez Firebase Authentication avec des providers OAuth (Google, Facebook, etc.) :

1. Allez dans **Firebase Console** > **Authentication** > **Settings** > **Authorized domains**
2. Ajoutez votre domaine : `votre-domaine.com`
3. Les redirections OAuth fonctionneront automatiquement via HTTPS

## Vérification

### 1. Tester la connexion HTTPS

```bash
curl -I https://votre-domaine.com
```

Vous devriez voir une réponse `200 OK` ou `301/302` si tout fonctionne.

### 2. Vérifier les WebSockets

1. Ouvrez votre application dans le navigateur : `https://votre-domaine.com`
2. Ouvrez la console développeur (F12)
3. Allez dans l'onglet **Network** > **WS** (WebSocket)
4. Vous devriez voir une connexion WebSocket active (pour le HMR)
5. Aucune erreur de connexion WebSocket ne devrait apparaître

### 3. Tester le HMR

1. Modifiez un fichier dans votre projet (par exemple `src/App.tsx`)
2. Sauvegardez le fichier
3. La page devrait se recharger automatiquement dans le navigateur
4. Si le HMR fonctionne, vous verrez "hmr update" dans la console du navigateur

## Dépannage

### Problème : Erreur 502 Bad Gateway

**Cause** : Vite n'est pas lancé ou n'écoute pas sur le port 3000

**Solution** :
```bash
# Vérifier que Vite tourne
ps aux | grep vite

# Si Vite n'est pas lancé, le démarrer
cd mtg-app
npm run dev
```

### Problème : WebSockets ne fonctionnent pas

**Cause** : Headers WebSocket manquants dans la configuration nginx

**Solution** : Vérifiez que ces lignes sont présentes dans votre configuration :
```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### Problème : Certificat SSL invalide

**Cause** : Certificat expiré ou mal configuré

**Solution** :
```bash
# Vérifier le statut du certificat
sudo certbot certificates

# Renouveler le certificat manuellement si nécessaire
sudo certbot renew

# Tester le renouvellement
sudo certbot renew --dry-run
```

### Problème : Erreur de configuration nginx

**Cause** : Syntaxe incorrecte dans le fichier de configuration

**Solution** :
```bash
# Tester la configuration
sudo nginx -t

# Le message d'erreur indiquera la ligne problématique
# Corrigez-la et retestez
```

## Maintenance

### Renouvellement automatique du certificat SSL

Let's Encrypt renouvelle automatiquement les certificats. Vérifiez que le service cron est actif :

```bash
# Vérifier le statut du timer certbot
sudo systemctl status certbot.timer

# Vérifier les logs de renouvellement
sudo certbot renew --dry-run
```

### Logs nginx

Pour déboguer les problèmes :

```bash
# Logs d'accès
sudo tail -f /var/log/nginx/access.log

# Logs d'erreur
sudo tail -f /var/log/nginx/error.log
```

## Résumé

- ✅ Nginx écoute sur le port 443 (HTTPS)
- ✅ Proxy vers `http://localhost:3000` (HTTP interne)
- ✅ Support des WebSockets pour le HMR
- ✅ Headers de sécurité configurés
- ✅ Headers X-Forwarded-* pour Vite
- ✅ Vite continue de tourner en HTTP sur le port 3000

Cette configuration permet d'accéder à votre application via HTTPS tout en laissant Vite tourner en HTTP en local, ce qui est la configuration recommandée pour le développement et la production.



