# Documentation — MTG Collection

Index de la documentation du projet. **Stack actuelle : PocketBase + React/Vite.**

## Démarrage

| Document | Description |
|----------|-------------|
| [../README.md](../README.md) | Installation, fonctionnalités, scripts |
| [DEVELOPMENT_LOCAL.md](./DEVELOPMENT_LOCAL.md) | Dev local (PocketBase + Vite) |
| [ENVIRONMENTS.md](./ENVIRONMENTS.md) | Variables d'env, déploiement |

## Architecture & technique

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Stack, collections PocketBase, flux |
| [SECURITY.md](./SECURITY.md) | Sécurité, auth, checklist prod |
| [TESTING.md](./TESTING.md) | Tests unitaires et E2E |
| [MTGJSON_PRICES.md](./MTGJSON_PRICES.md) | Prix et cache IndexedDB |
| [BACKEND_PRICES_API.md](./BACKEND_PRICES_API.md) | API backend prix |

## PocketBase

| Document | Description |
|----------|-------------|
| [POCKETBASE_HTTPS_SETUP.md](./POCKETBASE_HTTPS_SETUP.md) | HTTPS / nginx pour PocketBase |
| [POCKETBASE_ROLES_MIGRATION.md](./POCKETBASE_ROLES_MIGRATION.md) | Rôles multi-rôles (`roles` JSON) |
| [POCKETBASE_PASSWORD_CHANGE.md](./POCKETBASE_PASSWORD_CHANGE.md) | Changement de mot de passe |
| [../PROTOCOLE_ADMIN.md](../PROTOCOLE_ADMIN.md) | Création administrateur |
| [../ADMIN_SETUP.md](../ADMIN_SETUP.md) | Guide admin (court) |

## Déploiement & infra

| Document | Description |
|----------|-------------|
| [../NGINX_CONFIG.md](../NGINX_CONFIG.md) | Nginx pour le frontend Vite |
| [GDPR_DEPLOYMENT.md](./GDPR_DEPLOYMENT.md) | RGPD en production |
| [SENTRY_SETUP.md](./SENTRY_SETUP.md) | Monitoring Sentry |

## Migration & historique

| Document | Description |
|----------|-------------|
| [LEGACY_FIREBASE.md](./LEGACY_FIREBASE.md) | Migration Firebase → PocketBase (fichiers supprimés) |

## Planification (peut contenir des références obsolètes)

Ces documents reflètent des sprints passés ; certaines tâches mentionnent encore Firebase :

- [BACKLOG.md](./BACKLOG.md)
- [SUITE_PROGRAMME.md](./SUITE_PROGRAMME.md)
- [SPRINT_1_SUMMARY.md](./SPRINT_1_SUMMARY.md)
- [SPRINT_2_PLAN.md](./SPRINT_2_PLAN.md)
- [PLAN_ACTION_COMMERCIALISATION.md](./PLAN_ACTION_COMMERCIALISATION.md)

Pour l'état technique actuel, privilégier [ARCHITECTURE.md](./ARCHITECTURE.md) et [README.md](../README.md).

## Dépannage

| Document | Description |
|----------|-------------|
| [../TROUBLESHOOTING.md](../TROUBLESHOOTING.md) | Problèmes courants |
