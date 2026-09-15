# Plan d'Action - Commercialisation MTG Collection App

> **Mise à jour 2025 :** L'application a migré vers **PocketBase**. Les sections Firestore/Firebase ci-dessous sont historiques. Référence actuelle : [ARCHITECTURE.md](./ARCHITECTURE.md).

**Date de création** : 2024  
**Objectif** : Rendre l'application prête pour la commercialisation/production

## 📊 État Actuel du Projet

### ✅ Phase 0 : Stabilisation & Fondations - COMPLÉTÉE

- [x] **P0-1: Tests Unitaires Hooks Critiques** ✅
  - Tests créés pour `useAuth`, `useDecks`, `useCollection`
  - Couverture actuelle : ~30-40% (objectif : > 70%)
  - Tests intégrés dans CI/CD

- [x] **P0-2: Index Firestore** ✅
  - 13 index Firestore créés et déployés
  - Toutes les requêtes principales optimisées

- [x] **P0-3: Gestion d'Erreurs Centralisée** ✅
  - Service `errorHandler.ts` créé
  - Sentry intégré avec lazy loading
  - Messages utilisateur-friendly

- [x] **P0-4: Pipeline CI/CD** ✅
  - Workflows GitHub Actions configurés
  - Tests automatiques sur PRs
  - Déploiement automatique staging/production

### ✅ Phase 1 : Fonctionnalités Essentielles - COMPLÉTÉE

- [x] **P1-1: Export CSV/JSON** ✅
  - Export CSV, JSON, Deckbox, Moxfield
  - Interface utilisateur complète

- [x] **P1-2: Statistiques Collection** ✅
  - Valeur estimée (USD/EUR)
  - Graphiques par couleur/rareté/édition
  - Page dédiée fonctionnelle

- [x] **P1-3: Pagination Virtuelle** ✅
  - Virtualisation pour collections > 100 cartes
  - Performance optimisée pour 10k+ cartes
  - ⚠️ **NOTE** : Actuellement désactivée dans Collection.tsx (scroll naturel)

- [x] **P1-4: Monitoring & Logging** ✅
  - Sentry installé et configuré
  - Performance monitoring optionnel
  - ⚠️ **À FAIRE** : Configurer `VITE_SENTRY_DSN` en production

### ✅ Phase 2 : Fonctionnalités Complémentaires - PARTIELLEMENT COMPLÉTÉE

- [x] **P2-1: Wishlist** ✅
  - Système de wishlist fonctionnel
  - Page dédiée
  - ⚠️ **MANQUE** : Notifications prix

## 🚨 Points Critiques pour Commercialisation

### 1. Tests & Qualité

#### Tests Unitaires
- [ ] **Augmenter couverture à > 70%** (actuellement ~30-40%)
  - Priorité : Services critiques (`priceService`, `csvParser`, `exportService`)
  - Priorité : Hooks (`useCollection`, `useDecks`, `useWishlist`)
  - Priorité : Composants critiques (`CardDisplay`, `Collection`)

#### Tests E2E
- [x] Playwright configuré
- [ ] **Créer tests E2E pour flux critiques** :
  - [ ] Authentification (login/logout)
  - [ ] Import CSV
  - [ ] Export collection
  - [ ] Création/modification deck
  - [ ] Gestion wishlist
  - [ ] Navigation entre pages

#### Performance
- [ ] **Audit Lighthouse** (objectif : > 90)
  - [ ] First Contentful Paint
  - [ ] Largest Contentful Paint
  - [ ] Time to Interactive
  - [ ] Cumulative Layout Shift
- [ ] **Bundle size analysis**
  - [ ] Analyser taille bundle actuelle
  - [ ] Optimiser imports (tree shaking)
  - [ ] Code splitting plus agressif

### 2. Sécurité

#### Validation & Sécurité
- [ ] **Validation Zod** pour données critiques
  - [ ] Schémas validation pour imports CSV
  - [ ] Schémas validation pour données utilisateur
  - [ ] Validation côté client renforcée
- [ ] **Sanitization HTML** pour contenu utilisateur
- [ ] **Rate limiting** pour imports massifs
  - [ ] Limiter taille imports (ex: 1000 cartes max)
  - [ ] Queue système avec retry exponential
- [ ] **Vérifier règles Storage Firebase**
  - [ ] S'assurer que les règles sont déployées
  - [ ] Tester upload/delete avatars

#### Conformité RGPD
- [ ] **Consentement RGPD** au premier login
- [ ] **Politique de confidentialité** créée et accessible
- [ ] **Fonction suppression compte** complète
  - [ ] Suppression données Firestore
  - [ ] Suppression données Storage
  - [ ] Suppression données Sentry (si applicable)
- [ ] **Export données utilisateur** (déjà partiellement fait via export CSV)

### 3. Performance & Optimisation

#### Code Splitting
- [ ] **Lazy load routes**
  - [ ] Routes principales (Collection, Decks, Statistics)
  - [ ] Routes secondaires (Profile, Admin)
- [ ] **Dynamic imports composants lourds**
  - [ ] `VirtualizedCardGrid` (si réactivé)
  - [ ] `ExportModal`
  - [ ] Composants statistiques

#### Images & Assets
- [ ] **Optimisation images**
  - [ ] Compression images
  - [ ] Lazy loading images
  - [ ] WebP format si possible
- [ ] **Service Worker** pour cache assets
  - [ ] Cache statique
  - [ ] Mode offline basique

#### Bundle Size
- [ ] **Analyse bundle**
  - [ ] Identifier dépendances lourdes
  - [ ] Vérifier tree shaking
  - [ ] Supprimer dépendances inutilisées

### 4. Monitoring & Observabilité

#### Sentry
- [ ] **Configurer Sentry en production**
  - [ ] Ajouter `VITE_SENTRY_DSN` dans variables d'environnement production
  - [ ] Configurer alertes critiques
  - [ ] Configurer release tracking
- [ ] **Performance monitoring**
  - [ ] Activer Browser Tracing (déjà configuré, à activer)
  - [ ] Configurer seuils de performance

#### Logging
- [ ] **Structured logging** pour opérations critiques
  - [ ] Imports CSV
  - [ ] Exports
  - [ ] Erreurs API

### 5. Documentation & Support

#### Documentation Utilisateur
- [ ] **Guide utilisateur** complet
  - [ ] Comment importer une collection
  - [ ] Comment créer un deck
  - [ ] Comment utiliser la wishlist
  - [ ] FAQ
- [ ] **Documentation technique** mise à jour
  - [ ] Architecture
  - [ ] Déploiement
  - [ ] Configuration

#### Support
- [ ] **Page Contact/Support**
- [ ] **Gestion erreurs utilisateur** (messages clairs)

### 6. Bugs & Améliorations Techniques

#### Bugs Identifiés (BACKLOG)
- [ ] **B1: Memory Leak Cache Profils**
  - Fichier : `src/hooks/useCollection.ts`
  - Fix : Limiter taille cache ou TTL plus court
- [ ] **B2: Rate Limiting API**
  - Fichier : `src/services/scryfallApi.ts`
  - Fix : Queue système avec retry exponential
- [ ] **B3: Validation Données**
  - Fichier : Tous les services
  - Fix : Ajouter validation Zod

#### Améliorations Techniques
- [ ] **T1: Code Splitting** (voir section Performance)
- [ ] **T2: Image Optimization** (voir section Performance)
- [ ] **T3: Bundle Size** (voir section Performance)

## 📋 Checklist Commercialisation

### Prérequis Critiques (BLOCKERS)

- [ ] **Tests E2E** pour flux critiques
- [ ] **Couverture tests > 70%**
- [ ] **Audit Lighthouse > 90**
- [ ] **Sentry configuré en production**
- [ ] **Validation Zod** pour données critiques
- [ ] **Conformité RGPD** (consentement, politique confidentialité)
- [ ] **Documentation utilisateur** complète

### Important (Avant lancement)

- [ ] **Performance optimisée** (bundle size, code splitting)
- [ ] **Service Worker** pour offline basique
- [ ] **Rate limiting** pour imports
- [ ] **Sanitization HTML**
- [ ] **Vérification règles Storage Firebase**
- [ ] **Tests de charge** (optionnel mais recommandé)

### Nice to Have (Post-lancement)

- [ ] **Notifications prix** pour wishlist
- [ ] **Recherche avancée** (mana cost, power/toughness)
- [ ] **Vues alternatives** (liste/compacte/détaillée)
- [ ] **Partage collections** publiques
- [ ] **Système abonnement** (freemium)

## 🎯 Priorités Immédiates

### Sprint 1 (1-2 semaines) - BLOCKERS
1. Tests E2E flux critiques
2. Augmenter couverture tests à > 70%
3. Audit Lighthouse et optimisations
4. Configurer Sentry en production
5. Validation Zod pour imports CSV

### Sprint 2 (1-2 semaines) - IMPORTANT
1. Conformité RGPD (consentement, politique)
2. Service Worker offline
3. Rate limiting imports
4. Documentation utilisateur
5. Sanitization HTML

### Sprint 3 (1 semaine) - FINALISATION
1. Tests de charge
2. Vérification finale sécurité
3. Documentation technique mise à jour
4. Préparation lancement

## 📝 Notes

- **Pagination virtuelle** : Actuellement désactivée dans Collection.tsx (scroll naturel). À réévaluer selon retours utilisateurs.
- **Sentry** : Installé mais nécessite `VITE_SENTRY_DSN` en production pour être actif.
- **Tests** : Infrastructure en place, besoin d'augmenter la couverture.
- **CI/CD** : Fonctionnel, déploiement automatique configuré.

## 🔄 Mise à Jour

Ce document doit être mis à jour régulièrement selon l'avancement :
- [ ] Marquer les tâches complétées
- [ ] Ajouter nouvelles tâches identifiées
- [ ] Ajuster priorités selon retours

