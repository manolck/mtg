# Backlog Priorisé - MTG Collection App

## Épiques

### Phase 0: Stabilisation & Fondations
### Phase 1: Fonctionnalités Essentielles
### Phase 2: Expérience Utilisateur & Performance
### Phase 3: Social & Communauté
### Phase 4: Commercialisation & Scale

## User Stories Priorisées

### Priorité Critique (P0)

#### P0-1: Tests Unitaires Hooks Critiques
**Description**: Ajouter tests unitaires pour `useCollection`, `useDecks`, `useAuth`
**Acceptance Criteria**:
- Couverture > 70% sur hooks critiques
- Tous les tests passent
- Tests dans CI/CD

#### P0-2: Index Firestore
**Description**: Créer tous les index nécessaires pour les requêtes
**Acceptance Criteria**:
- Tous les index créés
- Requêtes optimisées (< 500ms)
- Pas d'erreurs "index missing"

#### P0-3: Gestion d'Erreurs Centralisée
**Description**: Créer service de gestion d'erreurs avec logging
**Acceptance Criteria**:
- Service `errorHandler.ts` créé
- Erreurs loggées dans Sentry
- Messages utilisateur-friendly

#### P0-4: CI/CD Pipeline
**Description**: Mettre en place pipeline CI/CD basique
**Acceptance Criteria**:
- Tests automatiques
- Build automatique
- Déploiement staging automatique

### Priorité Haute (P1)

#### P1-1: Export CSV/JSON
**Description**: Permettre export de collection en CSV/JSON
**Acceptance Criteria**:
- Export CSV fonctionnel
- Export JSON fonctionnel
- Interface utilisateur intuitive

#### P1-2: Statistiques Collection
**Description**: Afficher statistiques de la collection
**Acceptance Criteria**:
- Valeur estimée calculée
- Graphiques par couleur/rareté
- Page dédiée statistiques

#### P1-3: Pagination Virtuelle
**Description**: Implémenter pagination pour grandes collections
**Acceptance Criteria**:
- Collection 10k+ cartes fluide
- Performance Lighthouse > 90
- Pas de lag UI

#### P1-4: Monitoring & Logging
**Description**: Intégrer Sentry pour monitoring
**Acceptance Criteria**:
- Erreurs trackées
- Performance monitoring
- Alertes configurées

### Priorité Moyenne (P2)

#### P2-1: Wishlist
**Description**: Système de wishlist avec notifications
**Acceptance Criteria**:
- Ajout/suppression wishlist
- Page dédiée
- Notifications prix (si disponible)

#### P2-2: Recherche Avancée
**Description**: Améliorer recherche avec filtres avancés
**Acceptance Criteria**:
- Filtres mana cost, power/toughness
- Sauvegarde recherches
- Historique recherche

#### P2-3: Vues Alternatives
**Description**: Ajouter vues liste/compacte/détaillée
**Acceptance Criteria**:
- 3+ vues fonctionnelles
- Préférences sauvegardées
- Performance équivalente

#### P2-4: Service Worker Offline
**Description**: Support basique offline
**Acceptance Criteria**:
- Cache des assets
- Mode offline fonctionnel
- Sync quand reconnecté

### Priorité Basse (P3)

#### P3-1: Partage Collections
**Description**: Permettre partage collections publiques
**Acceptance Criteria**:
- Collections publiques/privées
- Liens de partage
- Vue publique sans auth

#### P3-2: Social Features
**Description**: Système social (likes, commentaires)
**Acceptance Criteria**:
- Partage decks
- Likes/commentaires
- Feed d'activité

#### P3-3: Système Abonnement
**Description**: Modèle freemium avec Stripe
**Acceptance Criteria**:
- Paiements fonctionnels
- Limites freemium
- Gestion abonnements

## Bugs à Corriger

### B1: Memory Leak Cache Profils
**Fichier**: `src/hooks/useCollection.ts`
**Fix**: Limiter taille cache ou TTL plus court

### B2: Rate Limiting API
**Fichier**: `src/services/scryfallApi.ts`
**Fix**: Queue système avec retry exponential

### B3: Validation Données
**Fichier**: Tous les services
**Fix**: Ajouter validation Zod ou similaire

## Améliorations Techniques

### T1: Code Splitting
- Lazy load routes
- Dynamic imports composants lourds

### T2: Image Optimization
- Compression images
- Lazy loading images
- WebP format

### T3: Bundle Size
- Analyse bundle
- Tree shaking
- Remove unused deps

## Notes

- Priorités peuvent changer selon retours utilisateurs
- Épiques peuvent être divisées en sprints
- Estimation effort: Story points (1-5)




