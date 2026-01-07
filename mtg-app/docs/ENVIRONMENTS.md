# Configuration des Environnements

## Vue d'ensemble

L'application supporte trois environnements :
- **Development** : Environnement local de développement
- **Staging** : Environnement de test avant production
- **Production** : Environnement de production

## Variables d'Environnement

### Development (.env.local)
```env
VITE_FIREBASE_API_KEY=dev-api-key
VITE_FIREBASE_AUTH_DOMAIN=dev-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=dev-project
VITE_FIREBASE_STORAGE_BUCKET=dev-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=dev-sender-id
VITE_FIREBASE_APP_ID=dev-app-id
VITE_APP_ENV=development
```

### Staging
Variables configurées dans GitHub Secrets :
- `VITE_FIREBASE_API_KEY_STAGING`
- `VITE_FIREBASE_AUTH_DOMAIN_STAGING`
- `VITE_FIREBASE_PROJECT_ID_STAGING`
- `VITE_FIREBASE_STORAGE_BUCKET_STAGING`
- `VITE_FIREBASE_MESSAGING_SENDER_ID_STAGING`
- `VITE_FIREBASE_APP_ID_STAGING`

### Production
Variables configurées dans GitHub Secrets :
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## Déploiement

### Staging
- Déclenché automatiquement sur push vers `develop`
- Déploiement sur Firebase Hosting channel `staging`
- URL : `https://staging--[project-id].web.app`

### Production
- Déclenché automatiquement sur push vers `main` ou tag `v*`
- Déploiement sur Firebase Hosting
- URL : `https://[project-id].web.app`

## Secrets GitHub

### Firebase Service Account
- `FIREBASE_SERVICE_ACCOUNT` : JSON du service account pour production
- `FIREBASE_SERVICE_ACCOUNT_STAGING` : JSON du service account pour staging

### Firebase Token
- `FIREBASE_TOKEN` : Token pour les opérations Firebase CLI

## Configuration Firebase

Chaque environnement doit avoir :
1. Un projet Firebase séparé (ou un projet avec plusieurs apps)
2. Des règles Firestore configurées
3. Des index Firestore créés
4. Firebase Storage activé
5. Firebase Authentication configuré (Email/Password)

## Rollback

En cas de problème en production :
1. Utiliser Firebase Console pour revenir à une version précédente
2. Ou créer un tag de la version précédente et redéployer



