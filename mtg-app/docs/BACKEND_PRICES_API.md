# API Backend pour les Prix MTGJSON

## Vue d'ensemble

Le fichier MTGJSON (1-2 GB) est maintenant téléchargé et indexé **côté serveur** via Firebase Functions. Les clients font des requêtes légères à l'API au lieu de télécharger le fichier entier.

## Architecture

### Backend (Firebase Functions)
- **Télécharge** le fichier AllPrices.json depuis MTGJSON
- **Indexe** chaque carte dans Firestore
- **Expose** une API REST pour rechercher les prix
- **Mise à jour automatique** 2 fois par mois via cron job

### Frontend (Client)
- **Requêtes légères** à l'API (quelques KB par requête)
- **Cache en mémoire** pour éviter les requêtes répétées
- **Pas de téléchargement** du fichier 1-2 GB

## Installation

### 1. Installer les dépendances Firebase Functions

```bash
cd functions
npm install
```

### 2. Configurer Firebase Functions

Assurez-vous d'avoir Firebase CLI installé :

```bash
npm install -g firebase-tools
firebase login
```

### 3. Déployer les Functions

```bash
# Depuis la racine du projet
firebase deploy --only functions
```

## Endpoints API

### GET /getCardPrice

Recherche le prix d'une carte.

**Paramètres :**
- `cardName` (requis) : Nom de la carte
- `setCode` (optionnel) : Code du set (ex: "LEA", "M21")

**Exemple :**
```
GET /getCardPrice?cardName=Lightning Bolt&setCode=LEA
```

**Réponse :**
```json
{
  "price": {
    "usd": "10.50",
    "usdFoil": "25.00",
    "eur": "9.50",
    "eurFoil": "22.00"
  }
}
```

### POST /updateMTGJSONPrices

Force la mise à jour manuelle des prix (télécharge et indexe le fichier).

**Réponse :**
```json
{
  "success": true,
  "message": "Prices updated successfully"
}
```

## Mise à jour automatique

Un cron job s'exécute automatiquement **2 fois par mois** (1er et 15 de chaque mois à 2h du matin) pour télécharger et indexer le nouveau fichier MTGJSON.

## Téléchargement Initial

**IMPORTANT** : Après le déploiement des functions, vous devez déclencher le téléchargement initial **une seule fois** :

```bash
curl -X POST https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net/updateMTGJSONPrices
```

Ou via le frontend, l'app vérifie automatiquement au démarrage si une mise à jour est nécessaire.

## Configuration

### Variables d'environnement

Ajoutez dans `.env.local` :

```env
VITE_FIREBASE_FUNCTIONS_URL=https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net
```

Remplacez `YOUR-PROJECT-ID` par votre ID de projet Firebase.

## Structure Firestore

Les prix sont indexés dans la collection `mtgjson_prices` :

```
mtgjson_prices/
  {cardName}/
    - cardName: string
    - pricesBySet: {
        {setCode}: {
          usd?: string
          usdFoil?: string
          eur?: string
          eurFoil?: string
          tix?: string
        }
      }
    - updatedAt: Timestamp
```

## Avantages

1. **Pas de téléchargement côté client** : Le fichier 1-2 GB reste sur le serveur
2. **Requêtes légères** : Seulement quelques KB par recherche de prix
3. **Mise à jour centralisée** : Un seul téléchargement pour tous les utilisateurs
4. **Performance** : Recherche rapide via Firestore indexé
5. **Mise à jour automatique** : Cron job gère les mises à jour

## Coûts

- **Firebase Functions** : ~$0.40 par million d'invocations
- **Firestore** : Lecture ~$0.06/100k documents, Écriture ~$0.18/100k documents
- **Stockage** : ~$0.18/GB/mois

Pour une application avec 1000 utilisateurs recherchant 10 prix/jour :
- ~10k requêtes/jour = ~300k/mois
- Coût Functions : ~$0.12/mois
- Coût Firestore (lectures) : ~$0.18/mois
- **Total : ~$0.30/mois**

## Développement local

Pour tester les functions localement :

```bash
cd functions
npm run serve
```

Les endpoints seront disponibles sur `http://localhost:5001/YOUR-PROJECT-ID/us-central1/`

