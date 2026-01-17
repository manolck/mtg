# Configuration MTGJSON pour les Prix

## Vue d'ensemble

L'application utilise les fichiers statiques MTGJSON pour obtenir les prix des cartes Magic: The Gathering. Cette approche offre plusieurs avantages :

- **Gratuit** : Pas besoin d'API key ou d'abonnement
- **Pas de rate limits** : Les données sont locales
- **Prix multi-sources** : Cardmarket (EUR), TCGplayer (USD), MTGO (TIX)
- **Mise à jour automatique** : Téléchargement automatique 2 fois par mois

## Fonctionnement

### 1. Téléchargement initial

Au premier démarrage de l'application, le fichier `AllPrices.json` est téléchargé depuis MTGJSON et mis en cache dans le localStorage du navigateur.

### 2. Mise à jour automatique

Le système vérifie automatiquement si une mise à jour est nécessaire :
- **Intervalle** : Tous les 15 jours (2 fois par mois)
- **Vérification** : Au démarrage de l'application
- **Téléchargement** : En arrière-plan, ne bloque pas l'utilisation

### 3. Recherche de prix

Lors de la recherche d'un prix :
1. **MTGJSON** est consulté en premier (données locales, rapide)
2. Si le prix n'est pas trouvé, **Scryfall** est utilisé en fallback

### 4. Sources de prix

MTGJSON agrège les prix de plusieurs sources :
- **Cardmarket** : Prix en EUR (retail et buylist)
- **TCGplayer** : Prix en USD (retail et buylist)
- **Cardhoarder** : Prix MTGO en TIX

## Structure des données

Le fichier `AllPrices.json` a la structure suivante :

```json
{
  "data": {
    "Card Name": {
      "SET": {
        "paper": {
          "cardmarket": {
            "retail": {
              "normal": 10.50,
              "foil": 25.00
            }
          },
          "tcgplayer": {
            "retail": {
              "normal": 12.00,
              "foil": 28.00
            }
          }
        }
      }
    }
  },
  "meta": {
    "date": "2024-01-15",
    "version": "5.2.0"
  }
}
```

## Gestion du stockage

### LocalStorage

Les données sont stockées dans le localStorage du navigateur :
- **Clé** : `mtgjson_prices` (données JSON)
- **Clé** : `mtgjson_last_update` (date de dernière mise à jour)

### Limitations

- **Taille** : Le fichier AllPrices.json peut être volumineux (~50-100 MB)
- **Quota** : localStorage a une limite de ~5-10 MB selon le navigateur
- **Solution** : Si localStorage est plein, les données sont chargées depuis le réseau à chaque fois

### Amélioration future

Pour les gros fichiers, il serait préférable d'utiliser **IndexedDB** au lieu de localStorage. Cela permettrait de stocker des fichiers beaucoup plus volumineux.

## Mise à jour manuelle

Si vous souhaitez forcer une mise à jour manuelle, vous pouvez appeler :

```typescript
import { updateMTGJSONPrices } from './services/mtgjsonPriceService';

await updateMTGJSONPrices();
```

## Vérification de la dernière mise à jour

Pour connaître la date de la dernière mise à jour :

```typescript
import { getLastUpdateDate } from './services/mtgjsonPriceService';

const lastUpdate = getLastUpdateDate();
console.log('Last update:', lastUpdate);
```

## Documentation officielle

- [MTGJSON](https://mtgjson.com/)
- [Téléchargements MTGJSON](https://mtgjson.com/downloads/all-files/)
- [Format des données](https://mtgjson.com/data-models/)

## Notes techniques

- Le fichier est téléchargé en arrière-plan au démarrage
- Les prix sont mis en cache en mémoire (LRU cache) pour des recherches rapides
- La recherche est insensible à la casse
- Si un set est spécifié, le prix de ce set est utilisé, sinon le premier set disponible



