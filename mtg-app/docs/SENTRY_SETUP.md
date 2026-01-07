# Configuration Sentry pour le Monitoring

Sentry est un service de monitoring d'erreurs qui permet de tracker les erreurs en production.

## Installation

```bash
npm install @sentry/react
```

## Configuration

1. Créer un compte sur [Sentry.io](https://sentry.io)
2. Créer un nouveau projet React
3. Récupérer votre DSN (Data Source Name)

## Variables d'environnement

Ajoutez votre DSN Sentry dans `.env.local` :

```env
VITE_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

Pour la production, ajoutez la variable dans votre plateforme de déploiement (Firebase, Vercel, etc.).

## Utilisation

Le système de monitoring est déjà intégré dans `errorHandler.ts`. Il se charge automatiquement si `VITE_SENTRY_DSN` est défini.

### Lazy Loading

Sentry est chargé de manière lazy (à la demande) pour éviter d'augmenter la taille du bundle si non configuré.

### Fonctionnalités

- Capture automatique des erreurs non gérées
- Capture des erreurs via `errorHandler.handleError()`
- Tags personnalisés (type d'erreur, retryable, etc.)
- Contexte supplémentaire (code, message)

## Désactivation

Pour désactiver Sentry, supprimez simplement la variable `VITE_SENTRY_DSN` de votre fichier d'environnement.

## Performance Monitoring (Optionnel)

Pour activer le monitoring de performance, modifiez `errorHandler.ts` :

```typescript
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: sentryDsn,
  integrations: [
    new Sentry.BrowserTracing(),
  ],
  tracesSampleRate: 0.1, // 10% des transactions
});
```

