# Index Firestore - Documentation

## Vue d'ensemble

Ce document décrit tous les index Firestore créés pour optimiser les performances des requêtes.

## Index Créés

### 1. Collection Group - Par Date de Création

**Collection**: `collection` (collectionGroup)  
**Champs**:
- `createdAt` (DESCENDING)

**Utilisé pour**: Chargement initial de toutes les collections triées par date

**Requête**:
```typescript
const collectionsGroup = collectionGroup(db, 'collection');
const query = query(collectionsGroup, limit(500));
```

### 2. Collection Group - Par Nom et Date

**Collection**: `collection` (collectionGroup)  
**Champs**:
- `name` (ASCENDING)
- `createdAt` (DESCENDING)

**Utilisé pour**: Recherche et tri par nom dans toutes les collections

### 3. Collection Group - Par Set et Date

**Collection**: `collection` (collectionGroup)  
**Champs**:
- `set` (ASCENDING)
- `createdAt` (DESCENDING)

**Utilisé pour**: Filtrage par édition dans toutes les collections

### 4. Collection Group - Par Rareté et Date

**Collection**: `collection` (collectionGroup)  
**Champs**:
- `rarity` (ASCENDING)
- `createdAt` (DESCENDING)

**Utilisé pour**: Filtrage par rareté dans toutes les collections

### 5. Decks - Par Date de Création

**Collection**: `decks`  
**Champs**:
- `createdAt` (DESCENDING)

**Utilisé pour**: Liste des decks triés par date de création

**Requête**:
```typescript
const decksRef = collection(db, 'users', userId, 'decks');
const query = query(decksRef, orderBy('createdAt', 'desc'));
```

### 6. Imports - Par Date de Création

**Collection**: `imports`  
**Champs**:
- `createdAt` (DESCENDING)

**Utilisé pour**: Liste des imports triés par date

### 7. Imports - Par Statut et Date

**Collection**: `imports`  
**Champs**:
- `status` (ASCENDING)
- `createdAt` (DESCENDING)

**Utilisé pour**: Filtrage des imports par statut (pending, running, completed, etc.)

## Déploiement des Index

### Via Firebase CLI

```bash
firebase deploy --only firestore:indexes
```

### Via GitHub Actions

Les index sont déployés automatiquement lors du déploiement en production (voir `.github/workflows/deploy-production.yml`).

## Vérification des Index

### Dans Firebase Console

1. Aller dans Firestore > Indexes
2. Vérifier que tous les index sont créés et actifs
3. Vérifier l'état (Building, Enabled, Error)

### Via CLI

```bash
firebase firestore:indexes
```

## Index Manquants

Si une requête échoue avec l'erreur "The query requires an index", Firebase Console fournira un lien pour créer l'index automatiquement.

## Performance

### Coûts

- **Lecture**: ~$0.06/100k documents
- **Écriture**: ~$0.18/100k documents
- Les index n'ajoutent pas de coût supplémentaire

### Optimisations

1. **Limiter les résultats**: Utiliser `limit()` pour réduire les lectures
2. **Pagination**: Charger par batch plutôt que tout d'un coup
3. **Cache**: Mettre en cache les résultats fréquemment utilisés

## Maintenance

### Ajout d'Index

1. Ajouter l'index dans `firestore.indexes.json`
2. Déployer via Firebase CLI
3. Attendre que l'index soit créé (peut prendre quelques minutes)

### Suppression d'Index

1. Retirer l'index de `firestore.indexes.json`
2. Déployer via Firebase CLI
3. L'index sera supprimé automatiquement

## Notes

- Les index collectionGroup sont plus coûteux en performance
- Utiliser avec parcimonie pour les grandes collections
- Préférer les requêtes sur une collection spécifique quand possible


