# Configuration Sentry pour le Monitoring

Sentry est un service de monitoring d'erreurs qui permet de tracker les erreurs en production.

## Installation

```bash
npm install @sentry/react
```

**Note** : Le package est déjà installé dans le projet.

## Configuration

### 1. Créer un compte Sentry

1. Créer un compte sur [Sentry.io](https://sentry.io)
2. Créer une nouvelle organisation (si nécessaire)
3. Créer un nouveau projet React
4. Sélectionner "React" comme framework

### 2. Récupérer le DSN

Une fois le projet créé, Sentry vous fournira un DSN (Data Source Name) au format :
```
https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
```

### 3. Configuration en Développement

Ajoutez votre DSN Sentry dans `.env.local` :

```env
VITE_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

**Important** : Ne commitez jamais le fichier `.env.local` dans Git.

### 4. Configuration en Production

#### Option A : Firebase Hosting

1. Dans Firebase Console, allez dans **Hosting** > **Paramètres**
2. Ajoutez la variable d'environnement :
   - Nom : `VITE_SENTRY_DSN`
   - Valeur : Votre DSN Sentry

Ou via Firebase CLI :

```bash
firebase functions:config:set sentry.dsn="https://your-sentry-dsn@sentry.io/project-id"
```

#### Option B : Vercel

1. Dans le dashboard Vercel, allez dans **Settings** > **Environment Variables**
2. Ajoutez :
   - Name : `VITE_SENTRY_DSN`
   - Value : Votre DSN Sentry
   - Environment : Production (et Preview si souhaité)

#### Option C : Autres plateformes

Ajoutez la variable d'environnement `VITE_SENTRY_DSN` dans les paramètres de votre plateforme de déploiement.

## Utilisation

Le système de monitoring est déjà intégré dans `errorHandler.ts`. Il se charge automatiquement si `VITE_SENTRY_DSN` est défini.

### Lazy Loading

Sentry est chargé de manière lazy (à la demande) pour éviter d'augmenter la taille du bundle si non configuré. Cela signifie que :
- Si `VITE_SENTRY_DSN` n'est pas défini, Sentry n'est pas chargé du tout
- Le bundle reste léger si Sentry n'est pas utilisé

### Fonctionnalités Actuelles

- ✅ Capture automatique des erreurs non gérées
- ✅ Capture des erreurs via `errorHandler.handleError()`
- ✅ Tags personnalisés (type d'erreur, retryable, etc.)
- ✅ Contexte supplémentaire (code, message, stack trace)
- ✅ Performance monitoring (10% des transactions en production, 100% en dev)
- ✅ Environnement détecté automatiquement (dev/prod)

### Exemple d'utilisation

```typescript
import { errorHandler } from './services/errorHandler';

try {
  // Votre code
} catch (error) {
  const appError = errorHandler.handleError(error);
  // L'erreur est automatiquement envoyée à Sentry
  // Et un message utilisateur-friendly est retourné
}
```

## Vérification de la Configuration

### En Développement

1. Démarrez l'application : `npm run dev`
2. Ouvrez la console du navigateur
3. Vérifiez qu'il n'y a pas d'erreur Sentry
4. Déclenchez une erreur (ex: import CSV invalide)
5. Vérifiez dans Sentry Dashboard que l'erreur apparaît

### En Production

1. Déployez l'application avec `VITE_SENTRY_DSN` configuré
2. Testez une fonctionnalité qui peut générer une erreur
3. Vérifiez dans Sentry Dashboard que l'erreur est capturée

## Configuration Avancée

### Performance Monitoring

Le monitoring de performance est déjà activé dans `errorHandler.ts` :
- **Production** : 10% des transactions (pour limiter l'impact)
- **Développement** : 100% des transactions (pour le debugging)

Pour modifier le taux d'échantillonnage, éditez `src/services/errorHandler.ts` :

```typescript
tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0, // Modifier 0.1 pour changer le taux
```

### Filtrage des Erreurs

Pour filtrer certaines erreurs (ex: erreurs de développement), modifiez la fonction `beforeSend` dans `errorHandler.ts` :

```typescript
beforeSend(event, hint) {
  // Filtrer les erreurs de développement
  if (import.meta.env.DEV) {
    return null; // Ne pas envoyer en dev
  }
  
  // Filtrer certaines erreurs spécifiques
  if (event.exception?.values?.[0]?.value?.includes('Chrome')) {
    return null; // Ignorer les erreurs Chrome spécifiques
  }
  
  return event;
}
```

### Release Tracking

Pour suivre les releases, ajoutez dans `errorHandler.ts` :

```typescript
Sentry.init({
  dsn: sentryDsn,
  release: import.meta.env.VITE_APP_VERSION || 'unknown',
  // ... autres options
});
```

Puis définissez `VITE_APP_VERSION` dans vos variables d'environnement.

## Alertes et Notifications

### Configurer des Alertes

1. Dans Sentry Dashboard, allez dans **Alerts**
2. Créez une nouvelle alerte :
   - **Condition** : Nombre d'erreurs > X dans Y minutes
   - **Action** : Email, Slack, Discord, etc.

### Alertes Recommandées

- **Erreurs critiques** : > 10 erreurs en 5 minutes
- **Nouvelles erreurs** : Première occurrence d'une erreur
- **Taux d'erreur élevé** : > 5% des sessions

## Désactivation

Pour désactiver Sentry :

1. **Temporairement** : Supprimez `VITE_SENTRY_DSN` de votre fichier d'environnement
2. **Permanemment** : Supprimez le code Sentry dans `errorHandler.ts` (non recommandé)

## Dépannage

### Sentry ne capture pas les erreurs

1. Vérifiez que `VITE_SENTRY_DSN` est bien défini
2. Vérifiez la console du navigateur pour des erreurs de chargement Sentry
3. Vérifiez que vous êtes sur la bonne organisation/projet dans Sentry Dashboard
4. Vérifiez les filtres dans Sentry (peut-être que les erreurs sont filtrées)

### Erreurs CORS

Si vous voyez des erreurs CORS avec Sentry :
- Vérifiez que votre domaine est autorisé dans Sentry Settings > Security
- Ajoutez votre domaine dans "Allowed Domains"

### Performance Impact

Si Sentry ralentit votre application :
- Réduisez `tracesSampleRate` (actuellement 0.1 = 10%)
- Désactivez le Browser Tracing si non nécessaire
- Vérifiez que le lazy loading fonctionne correctement

## Coûts

Sentry propose un plan gratuit avec :
- 5,000 erreurs/mois
- 10,000 transactions de performance/mois
- 1 projet

Pour plus d'informations, voir [Sentry Pricing](https://sentry.io/pricing/).

## Ressources

- [Documentation Sentry React](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Sentry Dashboard](https://sentry.io/)
- [Guide de configuration](https://docs.sentry.io/platforms/javascript/guides/react/configuration/)
