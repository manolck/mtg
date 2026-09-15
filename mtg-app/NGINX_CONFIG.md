# Configuration nginx — MTG Collection

## Architecture production (recommandée)

Le frontend est un **SPA Vite buildé** (`npm run build` → dossier `dist/`). Nginx sert les fichiers statiques en HTTPS ; PocketBase est un autre hôte (ou un `location` séparé).

```
Navigateur (HTTPS)
  → nginx (mtg-app.example.com) — fichiers dist/
  → PocketBase (pb.example.com) — API + auth
```

## Production : SPA statique

```nginx
# Redirection HTTP → HTTPS
server {
    listen 80;
    server_name mtg-app.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mtg-app.example.com;

    ssl_certificate     /etc/letsencrypt/live/mtg-app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mtg-app.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # Headers de sécurité
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    root /var/www/mtg-app;
    index index.html;

    client_max_body_size 10M;

    # Assets hashés : cache long
    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA : toutes les routes React → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Optionnel : webhook de déploiement (voir scripts/README-DEPLOY-WEBHOOK.md)
    # location /deploy {
    #     proxy_pass http://127.0.0.1:9090;
    #     proxy_http_version 1.1;
    #     proxy_set_header Host $host;
    #     proxy_set_header X-Real-IP $remote_addr;
    #     proxy_read_timeout 120s;
    # }
}
```

Déploiement :

1. `npm run build` (avec `VITE_POCKETBASE_URL` défini)
2. Copier le contenu de `dist/` vers `/var/www/mtg-app/`
3. `sudo nginx -t && sudo systemctl reload nginx`

## Développement : proxy vers Vite (optionnel)

Uniquement pour exposer `npm run dev` (port 3000) derrière HTTPS en local / labo. **Ne pas utiliser en production.**

```nginx
server {
    listen 443 ssl http2;
    server_name mtg-app.example.com;

    ssl_certificate     /etc/letsencrypt/live/mtg-app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mtg-app.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

## PocketBase HTTPS

Voir [docs/POCKETBASE_HTTPS_SETUP.md](./docs/POCKETBASE_HTTPS_SETUP.md). Le front doit être buildé avec `VITE_POCKETBASE_URL=https://pb.…` (HTTPS) pour éviter le Mixed Content.

## Références

- [docs/ENVIRONMENTS.md](./docs/ENVIRONMENTS.md)
- [scripts/README-DEPLOY-WEBHOOK.md](./scripts/README-DEPLOY-WEBHOOK.md)
