# Quand et Où le Fichier MTGJSON est Téléchargé

## Quand le Serveur Télécharge le Fichier

### 1. Téléchargement Initial (Manuel)

**Après le déploiement des Functions**, vous devez déclencher le téléchargement initial **une seule fois** :

```bash
# Option 1 : Via curl
curl -X POST https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net/updateMTGJSONPrices

# Option 2 : Via le code frontend (dans App.tsx, il y a déjà une vérification)
# L'app vérifie automatiquement si une mise à jour est nécessaire au démarrage
```

### 2. Mise à Jour Automatique (Cron Job)

Le serveur télécharge automatiquement le fichier **2 fois par mois** :
- **1er de chaque mois à 2h du matin** (timezone: Europe/Paris)
- **15 de chaque mois à 2h du matin** (timezone: Europe/Paris)

Le cron job `scheduledUpdateMTGJSONPrices` s'exécute automatiquement.

### 3. Mise à Jour Manuelle

Vous pouvez forcer une mise à jour à tout moment en appelant :
```bash
POST /updateMTGJSONPrices
```

## Où le Fichier est Stocké

### ⚠️ Important : Le Fichier n'est PAS Stocké comme Fichier

Le fichier MTGJSON (1-2 GB) **n'est pas stocké comme fichier brut** sur le serveur. Voici ce qui se passe :

### Processus de Stockage

1. **Téléchargement Temporaire** (en mémoire)
   - La Cloud Function télécharge le fichier depuis `https://mtgjson.com/api/v5/AllPrices.json`
   - Le fichier est chargé **en mémoire** dans la fonction (pas de stockage disque)

2. **Parsing et Indexation** (dans Firestore)
   - Le fichier JSON est parsé
   - Chaque carte est extraite et indexée dans **Firestore**
   - Structure de stockage :

```
Firestore Database:
├── mtgjson_prices/          (Collection)
│   ├── Lightning Bolt/       (Document - nom de la carte)
│   │   ├── cardName: "Lightning Bolt"
│   │   ├── pricesBySet: {
│   │   │   "LEA": {          (Code du set)
│   │   │     usd: "10.50",
│   │   │     usdFoil: "25.00",
│   │   │     eur: "9.50",
│   │   │     eurFoil: "22.00"
│   │   │   },
│   │   │   "M21": { ... }
│   │   │ }
│   │   └── updatedAt: Timestamp
│   ├── Black Lotus/          (Autre carte)
│   │   └── ...
│   └── ...
│
└── metadata/                (Collection)
    └── mtgjson_prices/       (Document)
        ├── lastUpdate: Timestamp
        ├── version: "5.2.0"
        └── totalCards: 50000
```

### Avantages de cette Approche

1. **Pas de stockage de fichier volumineux** : Le fichier 1-2 GB n'est jamais stocké comme fichier
2. **Recherche rapide** : Firestore indexe automatiquement les documents pour des recherches rapides
3. **Mise à jour incrémentale** : On peut mettre à jour uniquement les cartes qui ont changé
4. **Scalabilité** : Firestore gère automatiquement la répartition des données

### Coûts de Stockage

- **Firestore** : ~$0.18/GB/mois pour le stockage
- Pour ~50,000 cartes avec prix moyens : ~100-200 MB dans Firestore
- **Coût estimé** : ~$0.02-0.04/mois pour le stockage

## Résumé

| Aspect | Détails |
|--------|---------|
| **Quand** | 1. Initial : Manuel (après déploiement)<br>2. Automatique : 1er et 15 de chaque mois à 2h |
| **Où** | **Firestore** (pas de fichier brut)<br>- Collection `mtgjson_prices` : une carte = un document<br>- Collection `metadata` : métadonnées |
| **Taille** | ~100-200 MB dans Firestore (vs 1-2 GB fichier brut) |
| **Durée** | ~5-10 minutes pour télécharger et indexer |

## Vérification

Pour vérifier que les prix sont bien indexés :

1. **Firebase Console** > Firestore Database
2. Vérifier la collection `mtgjson_prices`
3. Vérifier le document `metadata/mtgjson_prices` pour la date de dernière mise à jour


