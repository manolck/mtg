# Workflows GitHub Actions

Les workflows actifs sont à la **racine du dépôt** : [../../.github/workflows/](../../.github/workflows/)

- `ci.yml` — lint, tests, build sur PR et push `main` / `develop`
- `build-production.yml` — build production + artifact sur `main`, tags `v*`, ou manuel

Ce dossier `.github/` dans `mtg-app/` n'est plus utilisé par GitHub Actions (le dépôt git est `mtg/`, pas `mtg-app/` seul).
