# Sprint 2 - Plan d'Action

> **Mise à jour 2025 :** Stack actuelle = **PocketBase**. Les tâches mentionnant Firestore/Firebase sont à adapter. Voir [ARCHITECTURE.md](./ARCHITECTURE.md).

**Date de début** : 2024-01-07  
**Objectif** : Préparer l'application pour le lancement (conformité, performance, documentation)

## 📋 Tâches du Sprint 2

### 1. Conformité RGPD (Priorité : Haute) 🔴

#### 1.1 Composant Consentement RGPD
- [ ] Créer `src/components/Legal/GDPRConsent.tsx`
- [ ] Afficher au premier login
- [ ] Stocker le consentement dans Firestore
- [ ] Gérer acceptation/refus

#### 1.2 Page Politique de Confidentialité
- [ ] Créer `src/pages/PrivacyPolicy.tsx`
- [ ] Contenu complet RGPD
- [ ] Lien accessible depuis footer/navbar
- [ ] Mention dans le consentement

#### 1.3 Fonction Suppression Compte Complète
- [ ] Améliorer `deleteUserAccount` dans `adminAuth.ts`
- [ ] Supprimer toutes les données Firestore :
  - Collection
  - Decks
  - Wishlist
  - Imports
  - Profil
- [ ] Supprimer données Storage (avatars)
- [ ] Supprimer compte Firebase Auth
- [ ] Ajouter fonction dans `useProfile.ts`
- [ ] Ajouter UI dans `Profile.tsx`

#### 1.4 Export Données Utilisateur
- [ ] Créer fonction export complet (JSON)
- [ ] Inclure toutes les données utilisateur
- [ ] Ajouter bouton dans Profile

### 2. Service Worker Offline (Priorité : Moyenne) 🟡

#### 2.1 Service Worker de Base
- [ ] Créer `public/sw.js`
- [ ] Configuration Vite pour service worker
- [ ] Cache statique (HTML, CSS, JS)

#### 2.2 Stratégie de Cache
- [ ] Cache-first pour assets statiques
- [ ] Network-first pour données API
- [ ] Cache images avec versioning

#### 2.3 Mode Offline Basique
- [ ] Afficher données en cache
- [ ] Message "Mode hors ligne"
- [ ] Synchronisation au retour en ligne

### 3. Rate Limiting Imports (Priorité : Moyenne) 🟡

#### 3.1 Limites Existantes
- [x] Limite 10000 cartes par import (déjà fait)
- [ ] Vérifier si suffisant

#### 3.2 Queue Système
- [ ] Créer système de queue pour imports
- [ ] Retry exponential
- [ ] Gestion des erreurs réseau

#### 3.3 UI Améliorée
- [ ] Progression détaillée
- [ ] Estimation temps restant
- [ ] Possibilité de pause/reprise

### 4. Documentation Utilisateur (Priorité : Haute) 🔴

#### 4.1 Guide Utilisateur
- [ ] Créer `docs/USER_GUIDE.md`
- [ ] Section : Importer une collection
- [ ] Section : Créer un deck
- [ ] Section : Utiliser la wishlist
- [ ] Section : Statistiques
- [ ] FAQ

#### 4.2 Page Aide dans l'App
- [ ] Créer `src/pages/Help.tsx`
- [ ] Intégrer le guide
- [ ] Recherche dans l'aide
- [ ] Liens depuis navbar

#### 4.3 Tooltips/Aide Contextuelle
- [ ] Ajouter tooltips sur boutons importants
- [ ] Info-bulles explicatives
- [ ] Guide de démarrage rapide

### 5. Sanitization HTML (Priorité : Moyenne) 🟡

#### 5.1 Utilitaire de Sanitization
- [ ] Créer `src/utils/sanitizer.ts`
- [ ] Utiliser DOMPurify ou équivalent
- [ ] Fonction de sanitization

#### 5.2 Application
- [ ] Sanitizer pour descriptions de decks
- [ ] Sanitizer pour notes de wishlist
- [ ] Sanitizer pour pseudonymes
- [ ] Vérifier tous les champs utilisateur

## 🎯 Ordre d'Exécution Recommandé

1. **Conformité RGPD** (Blocker légal)
2. **Documentation Utilisateur** (Important pour UX)
3. **Service Worker** (Améliore l'expérience)
4. **Rate Limiting** (Optimisation)
5. **Sanitization** (Sécurité)

## 📝 Notes

- La conformité RGPD est un **blocker légal** pour la commercialisation en Europe
- La documentation utilisateur améliore significativement l'expérience utilisateur
- Le service worker améliore les performances perçues
- Le rate limiting protège contre les abus
- La sanitization protège contre les attaques XSS

## ✅ Critères de Succès

- [ ] Consentement RGPD fonctionnel et stocké
- [ ] Politique de confidentialité accessible
- [ ] Suppression compte complète fonctionnelle
- [ ] Service worker actif et fonctionnel
- [ ] Rate limiting implémenté
- [ ] Guide utilisateur complet
- [ ] Page Aide accessible
- [ ] Sanitization appliquée partout

