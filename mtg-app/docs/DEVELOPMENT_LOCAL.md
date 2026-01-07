# Développement Local avec `npm run dev`

## Comportement en Développement

Quand vous lancez `npm run dev`, l'application fonctionne mais **les Firebase Functions ne sont pas disponibles** par défaut.

### Solution Automatique : Fallback vers Scryfall

L'application détecte automatiquement si elle est en mode développement et si l'API backend n'est pas disponible. Dans ce cas, elle utilise **automatiquement Scryfall** comme source de prix.

**Vous n'avez rien à faire** - ça marche automatiquement ! ✅

## Options pour Utiliser l'API Backend en Local

Si vous voulez tester l'API backend en local, vous avez 2 options :

### Option 1 : Utiliser l'Émulateur Firebase (Recommandé)

1. **Installer Firebase CLI** :
```bash
npm install -g firebase-tools
firebase login
```

2. **Démarrer l'émulateur** :
```bash
# Depuis la racine du projet
firebase emulators:start --only functions
```

3. **Configurer l'URL dans `.env.local`** :
```env
VITE_FIREBASE_FUNCTIONS_URL=http://localhost:5001/YOUR-PROJECT-ID/us-central1
```

4. **Dans un autre terminal, lancer l'app** :
```bash
npm run dev
```

### Option 2 : Utiliser les Functions Déployées

Si vous avez déjà déployé les functions sur Firebase :

1. **Configurer l'URL dans `.env.local`** :
```env
VITE_FIREBASE_FUNCTIONS_URL=https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net
```

2. **Lancer l'app** :
```bash
npm run dev
```

## Comportement par Défaut

**Sans configuration supplémentaire**, l'app fonctionne en développement avec :
- ✅ **Scryfall** comme source de prix (fallback automatique)
- ✅ Toutes les autres fonctionnalités fonctionnent normalement
- ⚠️ Les prix peuvent être moins complets (Scryfall vs MTGJSON)

## Vérification

Pour vérifier quelle source est utilisée, ouvrez la console du navigateur :
- Si vous voyez : `"MTGJSON API not available in development, will use Scryfall fallback"` → Scryfall est utilisé
- Si vous voyez des requêtes vers `/getCardPrice` → L'API backend est utilisée

## Recommandation

Pour le développement quotidien, **vous n'avez pas besoin de configurer l'API backend**. Le fallback vers Scryfall fonctionne automatiquement et c'est suffisant pour développer.

Utilisez l'émulateur uniquement si vous développez/testez les functions elles-mêmes.


