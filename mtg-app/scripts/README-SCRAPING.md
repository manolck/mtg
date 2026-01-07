# Script de Scraping MagicCorporation

Ce script permet de récupérer toutes les cartes Magic: The Gathering disponibles sur le site [MagicCorporation.com](http://www.magiccorporation.com).

## Installation

1. Installer les dépendances nécessaires :
```bash
npm install
```

Le script nécessite la bibliothèque `cheerio` pour parser le HTML, qui sera installée automatiquement.

## Utilisation

### Utilisation de base

Pour scraper toutes les cartes (949 pages) :
```bash
npm run scrape-magiccorporation
```

Ou directement :
```bash
node scripts/scrape-magiccorporation.js
```

### Options disponibles

- `--start-page=N` : Commencer à la page N (défaut: 1)
- `--end-page=N` : Terminer à la page N (défaut: 949)
- `--output=FILE` : Fichier de sortie (défaut: `magiccorporation-cards.json`)
- `--delay=MS` : Délai entre les requêtes en millisecondes (défaut: 1000ms = 1 seconde)
- `--resume` : Reprendre depuis le dernier point sauvegardé

### Exemples

Scraper seulement les 10 premières pages :
```bash
node scripts/scrape-magiccorporation.js --start-page=1 --end-page=10
```

Scraper avec un délai plus long entre les requêtes (pour être plus respectueux) :
```bash
node scripts/scrape-magiccorporation.js --delay=2000
```

Reprendre un scraping interrompu :
```bash
node scripts/scrape-magiccorporation.js --resume
```

Sauvegarder dans un fichier personnalisé :
```bash
node scripts/scrape-magiccorporation.js --output=mes-cartes.json
```

## Format de sortie

Le script génère un fichier JSON contenant un tableau de cartes. Chaque carte contient :

```json
{
  "nameVo": "Savannah Lions",
  "nameVf": "Lions des savanes",
  "number": "48",
  "type": "Créature",
  "power": "2",
  "toughness": "1",
  "edition": "4ème édition",
  "manaCost": "{W}",
  "color": "WHITE",
  "rarity": "RARE",
  "cardUrl": "http://www.magiccorporation.com/...",
  "scrapedAt": "2024-01-15T10:30:00.000Z"
}
```

## Fonctionnalités

- ✅ Parsing HTML robuste avec Cheerio
- ✅ Détection automatique du nombre total de pages
- ✅ Sauvegarde progressive (toutes les 10 pages)
- ✅ Reprise après interruption (`--resume`)
- ✅ Gestion des erreurs avec retry
- ✅ Respect des limites de taux (délai configurable)
- ✅ Statistiques détaillées à la fin

## Notes importantes

1. **Respect du serveur** : Le script inclut un délai par défaut de 1 seconde entre les requêtes pour ne pas surcharger le serveur. Vous pouvez l'augmenter avec `--delay` si nécessaire.

2. **Temps d'exécution** : Pour scraper toutes les 949 pages avec un délai de 1 seconde, cela prendra environ **16 minutes** (949 pages × 1 seconde = ~16 minutes). Avec un délai de 2 secondes, cela prendra environ **32 minutes**.

3. **Sauvegarde progressive** : Le script sauvegarde automatiquement toutes les 10 pages, donc en cas d'interruption, vous ne perdrez que les données de la dernière page en cours.

4. **Reprise** : Utilisez `--resume` pour reprendre un scraping interrompu. Le script chargera les données existantes et continuera à partir de la dernière page traitée.

5. **Fichier de progression** : Un fichier `.progress.json` est créé pendant l'exécution pour suivre la progression. Il est automatiquement supprimé à la fin.

## Dépannage

### Le script ne trouve pas de cartes

- Vérifiez que le site est accessible
- Vérifiez que la structure HTML du site n'a pas changé
- Essayez avec `--start-page=1 --end-page=1` pour tester sur une seule page

### Erreurs de connexion

- Vérifiez votre connexion Internet
- Augmentez le délai avec `--delay=2000` ou plus
- Le site peut avoir des protections anti-scraping, attendez un peu et réessayez

### Le parsing ne fonctionne pas correctement

- Le site peut avoir changé sa structure HTML
- Vérifiez le fichier HTML récupéré manuellement
- Contactez le développeur pour mettre à jour le script

## Structure du code

- `parseArgs()` : Parse les arguments de ligne de commande
- `fetchPage(url)` : Récupère le HTML d'une page
- `parseCards(html)` : Parse le HTML et extrait les cartes
- `parseCardRow($cells, $)` : Parse une ligne de carte individuelle
- `extractPaginationInfo(html)` : Extrait les informations de pagination
- `buildPageUrl(pageNumber)` : Construit l'URL d'une page
- `main()` : Fonction principale

## Licence

Ce script est fourni à des fins éducatives et de recherche. Assurez-vous de respecter les conditions d'utilisation du site MagicCorporation.com lors de l'utilisation de ce script.


