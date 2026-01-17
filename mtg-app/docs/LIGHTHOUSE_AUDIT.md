# Guide d'Audit Lighthouse

Ce document explique comment effectuer un audit Lighthouse pour l'application MTG Collection et interpréter les résultats.

## Installation

Lighthouse est intégré dans Chrome DevTools, mais vous pouvez aussi l'installer en ligne de commande :

```bash
npm install -g lighthouse
```

## Méthodes d'Audit

### 1. Via Chrome DevTools (Recommandé)

1. Ouvrez l'application dans Chrome
2. Ouvrez DevTools (F12)
3. Allez dans l'onglet "Lighthouse"
4. Sélectionnez les catégories à auditer :
   - Performance
   - Accessibility
   - Best Practices
   - SEO
5. Cliquez sur "Generate report"

### 2. Via Ligne de Commande

```bash
# Audit complet
lighthouse http://localhost:5173/collection --view

# Audit avec options spécifiques
lighthouse http://localhost:5173/collection \
  --only-categories=performance,accessibility \
  --output=html \
  --output-path=./lighthouse-report.html
```

### 3. Via CI/CD (GitHub Actions)

Créez un workflow GitHub Actions pour automatiser les audits :

```yaml
name: Lighthouse CI

on:
  pull_request:
    branches: [main, develop]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install -g @lhci/cli
      - run: npm install
      - run: npm run build
      - run: npm run preview &
      - run: lhci autorun
```

## Pages à Auditer

### Priorité Haute
1. **Collection** (`/collection`) - Page principale
2. **Statistics** (`/statistics`) - Page avec graphiques
3. **Decks** (`/decks`) - Liste de decks

### Priorité Moyenne
4. **Deck Builder** (`/decks/:id`) - Page de construction
5. **Wishlist** (`/wishlist`) - Liste de wishlist
6. **Profile** (`/profile`) - Profil utilisateur

## Métriques à Surveiller

### Performance

**Métriques Core Web Vitals** :
- **LCP (Largest Contentful Paint)** : < 2.5s (objectif)
- **FID (First Input Delay)** : < 100ms (objectif)
- **CLS (Cumulative Layout Shift)** : < 0.1 (objectif)

**Autres métriques** :
- First Contentful Paint (FCP) : < 1.8s
- Time to Interactive (TTI) : < 3.8s
- Total Blocking Time (TBT) : < 200ms
- Speed Index : < 3.4s

**Score cible** : > 90

### Accessibility

**Points à vérifier** :
- Contraste des couleurs
- Labels ARIA
- Navigation au clavier
- Structure sémantique HTML

**Score cible** : > 90

### Best Practices

**Points à vérifier** :
- HTTPS
- Pas de console errors
- Images optimisées
- Pas de vulnérabilités

**Score cible** : > 90

### SEO

**Points à vérifier** :
- Meta tags
- Structure sémantique
- URLs descriptives
- Sitemap

**Score cible** : > 90

## Optimisations Communes

### Performance

1. **Code Splitting**
   ```typescript
   // Lazy load des routes
   const Collection = lazy(() => import('./pages/Collection'));
   ```

2. **Image Optimization**
   - Utiliser WebP format
   - Lazy loading des images
   - Compression des images

3. **Bundle Size**
   - Analyser avec `npm run build -- --analyze`
   - Supprimer dépendances inutilisées
   - Tree shaking

4. **Caching**
   - Service Worker pour cache assets
   - Cache headers appropriés

### Accessibility

1. **ARIA Labels**
   ```tsx
   <button aria-label="Ajouter à la wishlist">
     <StarIcon />
   </button>
   ```

2. **Contraste**
   - Vérifier avec outils (WCAG AA minimum)
   - Utiliser Tailwind classes avec bon contraste

3. **Navigation Clavier**
   - Tous les éléments interactifs accessibles au clavier
   - Focus visible

### Best Practices

1. **HTTPS**
   - S'assurer que l'application est servie en HTTPS en production

2. **Console Errors**
   - Corriger toutes les erreurs console
   - Utiliser Sentry pour tracking

3. **Security Headers**
   - Content-Security-Policy
   - X-Frame-Options
   - X-Content-Type-Options

## Interprétation des Résultats

### Performance Score

- **90-100** : Excellent ✅
- **50-89** : Amélioration nécessaire ⚠️
- **0-49** : Critique ❌

### Actions selon Score

**Score < 50** :
1. Identifier les problèmes majeurs (bundle size, images non optimisées)
2. Implémenter code splitting
3. Optimiser les images

**Score 50-89** :
1. Optimiser les métriques Core Web Vitals
2. Réduire le bundle size
3. Améliorer le caching

**Score > 90** :
1. Maintenir le score
2. Optimisations mineures
3. Monitoring continu

## Automatisation

### Pre-commit Hook

Créer un hook pour vérifier le score avant commit :

```bash
# .husky/pre-commit
npm run lighthouse:check
```

### Script Package.json

```json
{
  "scripts": {
    "lighthouse:check": "lighthouse http://localhost:5173 --only-categories=performance --threshold=90",
    "lighthouse:report": "lighthouse http://localhost:5173 --output=html --output-path=./lighthouse-report.html"
  }
}
```

## Ressources

- [Lighthouse Documentation](https://developers.google.com/web/tools/lighthouse)
- [Web.dev Performance](https://web.dev/performance/)
- [Core Web Vitals](https://web.dev/vitals/)
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)

