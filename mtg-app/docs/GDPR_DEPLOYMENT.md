# Déploiement des Règles Firestore pour RGPD

## Problème

L'erreur "Missing or insufficient permissions" apparaît lors de la vérification du consentement RGPD car les règles Firestore pour `users/{userId}/legal/{document=**}` ne sont pas encore déployées.

## Solution

Les règles ont été ajoutées dans `firestore.rules`. Il faut maintenant les déployer :

```bash
cd mtg-app
firebase deploy --only firestore:rules
```

## Vérification

Après le déploiement, l'erreur devrait disparaître et le consentement RGPD devrait fonctionner correctement.

## Règles ajoutées

```javascript
// Règles pour les données légales (consentement RGPD, etc.)
match /users/{userId}/legal/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

Ces règles permettent à chaque utilisateur de lire et écrire ses propres données légales (consentement RGPD).

