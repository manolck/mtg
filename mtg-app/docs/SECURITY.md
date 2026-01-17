# Audit de Sécurité - MTG Collection App

## Vue d'ensemble

Ce document décrit l'audit de sécurité effectué sur l'application MTG Collection et les mesures de sécurité en place.

## Règles Firestore

### Analyse des Règles Actuelles

Les règles Firestore sont définies dans `firestore.rules` :

#### Points Forts
1. **Authentification requise** : Toutes les opérations nécessitent une authentification
2. **Isolation des données** : Chaque utilisateur ne peut modifier que ses propres données
3. **Rôle admin** : Fonction helper pour vérifier les admins
4. **Lecture publique contrôlée** : Collections lisibles par tous les utilisateurs connectés

#### Points d'Attention

1. **Collection Group Query** : 
   ```javascript
   match /{path=**}/collection/{cardId} {
     allow read: if request.auth != null;
   }
   ```
   - Permet la lecture de toutes les collections
   - Nécessite un index Firestore
   - Risque : Performance si beaucoup d'utilisateurs

2. **Pas de validation côté serveur** :
   - Validation uniquement côté client
   - Risque : Données invalides possibles
   - Solution : Cloud Functions pour validation

3. **Règles Storage** :
   - Pas de règles Storage définies dans le repo
   - À vérifier dans Firebase Console

### Recommandations

1. **Ajouter validation Cloud Functions** pour opérations critiques
2. **Limiter les requêtes collectionGroup** avec pagination
3. **Ajouter règles Storage** pour les avatars
4. **Audit régulier** des règles de sécurité

## Authentification

### Firebase Authentication

- **Méthode** : Email/Password
- **Sécurité** : Gérée par Firebase (sécurisé)
- **Sessions** : Gérées automatiquement par Firebase
- **CSRF** : Protection intégrée Firebase

### Points d'Attention

1. **Pas de 2FA** : À considérer pour production
2. **Pas de rate limiting côté client** : Firebase gère cela
3. **Mots de passe** : Validation minimale (6 caractères)

### Recommandations

1. **Ajouter validation mot de passe** plus stricte (8+ caractères, complexité)
2. **Considérer 2FA** pour comptes admin
3. **Ajouter rate limiting** pour login attempts

## API Externes

### Scryfall API

- **Rate Limiting** : 100ms delay entre requêtes
- **Cache** : 1 heure en mémoire
- **Sécurité** : HTTPS uniquement

### Points d'Attention

1. **Pas de retry automatique** : Erreurs réseau non gérées
2. **Cache en mémoire** : Perdu au refresh
3. **Pas de validation réponse API**

### Recommandations

1. **Implémenter retry** avec backoff exponentiel
2. **Cache persistant** (localStorage/IndexedDB)
3. **Validation schéma** des réponses API

## Données Sensibles

### Données Stockées

- **Collections** : Données utilisateur (non sensibles)
- **Profils** : Email, pseudonyme (non sensibles)
- **Decks** : Données utilisateur (non sensibles)

### Conformité RGPD

- **Consentement** : À ajouter
- **Droit à l'oubli** : Fonction de suppression compte
- **Export données** : À implémenter (Phase 1)
- **Politique confidentialité** : À créer

### Recommandations

1. **Ajouter consentement RGPD** au premier login
2. **Implémenter suppression compte** complète
3. **Créer politique confidentialité**
4. **Ajouter export données** utilisateur

## Rate Limiting

### Côté Client

- **Scryfall API** : 100ms delay entre requêtes
- **Firebase** : Rate limiting géré par Firebase

### Points d'Attention

1. **Pas de rate limiting global** côté application
2. **Imports massifs** peuvent surcharger l'API

### Recommandations

1. **Ajouter queue système** pour imports
2. **Limiter taille imports** (ex: 1000 cartes max)
3. **Ajouter pause/reprise** (déjà implémenté)

## Validation des Entrées

### Côté Client

- **Validation React** : Basique
- **TypeScript** : Typage statique
- **Pas de sanitization** HTML

### Points d'Attention

1. **XSS potentiel** : Données utilisateur affichées directement
2. **Pas de validation serveur**
3. **CSV parsing** : Pas de validation stricte

### Recommandations

1. **Sanitizer HTML** pour contenu utilisateur
2. **Validation Zod** pour données
3. **Validation Cloud Functions** pour opérations critiques

## Checklist de Sécurité

### À Faire Immédiatement

- [ ] Vérifier règles Storage dans Firebase Console
- [ ] Ajouter validation mot de passe plus stricte
- [ ] Implémenter retry automatique pour API
- [ ] Ajouter sanitization HTML

### Court Terme

- [ ] Cloud Functions pour validation
- [ ] Rate limiting global
- [ ] Conformité RGPD
- [ ] Audit sécurité régulier

### Moyen Terme

- [ ] 2FA pour admins
- [ ] Monitoring sécurité
- [ ] Tests de pénétration
- [ ] Documentation sécurité

## Outils Recommandés

1. **Sentry** : Monitoring erreurs et sécurité
2. **npm audit** : Vérification vulnérabilités
3. **Snyk** : Scan sécurité dépendances
4. **Firebase Security Rules Tester** : Tests règles

## Conclusion

L'application a une base de sécurité solide avec Firebase, mais nécessite des améliorations pour la production :
- Validation côté serveur
- Conformité RGPD
- Rate limiting
- Monitoring sécurité




