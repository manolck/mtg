# Application Web de Gestion de Collection MTG

Une application web moderne pour gérer votre collection de cartes Magic: The Gathering, créer des decks et organiser vos cartes.

## Fonctionnalités

- 🔐 **Authentification sécurisée** avec Firebase Authentication
- 📊 **Import CSV flexible** - Supporte plusieurs formats de fichiers CSV
- 🎴 **Affichage des cartes** avec images et détails depuis l'API MTG Dev
- 🃏 **Gestion de decks** - Créez et gérez vos decks personnalisés
- 🔒 **Sécurité** - Chaque utilisateur ne peut accéder qu'à ses propres données
- 📱 **Interface moderne** - Design responsive avec Tailwind CSS

## Prérequis

- Node.js 18+ et npm
- Un compte Firebase (gratuit)
- Un navigateur web moderne

## Installation

### 1. Cloner et installer les dépendances

```bash
cd mtg-app
npm install
```

### 2. Configuration Firebase

1. Créez un projet sur [Firebase Console](https://console.firebase.google.com)
2. Activez **Authentication** avec la méthode **Email/Password**
3. Créez une base de données **Firestore** en mode production
4. Copiez les informations de configuration de votre projet Firebase

### 3. Variables d'environnement

Créez un fichier `.env.local` à la racine du projet `mtg-app` :

```env
VITE_FIREBASE_API_KEY=your-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id

```

Vous pouvez trouver ces valeurs dans Firebase Console > Project Settings > General > Your apps.

### 4. Activer Firebase Storage

**IMPORTANT** : Firebase Storage doit être activé pour que les avatars fonctionnent.

1. Dans Firebase Console, allez dans **Storage**
2. Cliquez sur **"Get started"** ou **"Commencer"**
3. Choisissez **"Start in production mode"** (les règles seront déployées ensuite)
4. Choisissez un emplacement pour votre bucket (même région que Firestore recommandé)
5. Cliquez sur **"Done"**

### 5. Configuration des règles Firestore et Storage

Les règles de sécurité sont définies dans `firestore.rules` et `storage.rules`. Pour les déployer :

```bash
# Installer Firebase CLI si ce n'est pas déjà fait
npm install -g firebase-tools

# Se connecter à Firebase
firebase login

# Initialiser Firebase (si nécessaire)
firebase init firestore
firebase init storage

# Déployer les règles
firebase deploy --only firestore:rules,storage
```

**Note importante** : Si vous obtenez une erreur CORS lors de l'upload d'avatar, vérifiez que :
1. Firebase Storage est bien activé dans la console
2. Les règles Storage sont déployées : `firebase deploy --only storage`
3. Le bucket Storage est dans la même région que votre application

Les règles garantissent que :
- **Firestore** : Chaque utilisateur ne peut accéder qu'à ses propres données
  - `users/{userId}/collection/*` - Collection de cartes
  - `users/{userId}/decks/*` - Decks de l'utilisateur
  - `users/{userId}/profile/*` - Profil utilisateur (lecture publique, écriture privée)
- **Storage** : Les avatars peuvent être lus par tous, mais seul le propriétaire peut les modifier/supprimer

## Utilisation locale

```bash
npm run dev
```

L'application sera accessible sur `http://localhost:3000`

## Format CSV

L'application supporte plusieurs formats de fichiers CSV pour l'import de cartes :

### Format avec en-têtes (recommandé - format ManaBox/export standard)

Le format avec en-têtes est automatiquement détecté. Les colonnes suivantes sont supportées :

- **Name** (requis) - Nom de la carte
- **Quantity** - Quantité (par défaut: 1)
- **Set code** - Code de l'édition (ex: M21, LEA)
- **Set name** - Nom de l'édition
- **Collector number** - Numéro de collection
- **Foil** - Carte foil (true/false/yes/no/1/0)
- **Rarity** - Rareté (Common, Uncommon, Rare, Mythic Rare)
- **Condition** - État de la carte (Near Mint, Lightly Played, etc.)
- **Language** - Langue (par défaut: en)

**Exemple :**
```csv
Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,Condition,Language
Lightning Bolt,M21,Core Set 2021,161,false,Common,4,Near Mint,en
Black Lotus,LEA,Alpha Edition,1,false,Rare,1,Played,en
```

### Format simple sans en-têtes

#### Format 1 : Nom uniquement
```csv
Lightning Bolt
Black Lotus
Ancestral Recall
```

#### Format 2 : Nom + Quantité
```csv
Lightning Bolt, 4
Black Lotus, 1
Ancestral Recall, 1
```

#### Format 3 : Nom + Quantité + Édition
```csv
Lightning Bolt, 4, M21
Black Lotus, 1, LEA
Ancestral Recall, 1, LEA
```

**Note :** Le séparateur peut être une virgule (`,`), un point-virgule (`;`) ou une tabulation. Les valeurs entre guillemets sont correctement gérées.

## Structure du projet

```
mtg-app/
├── src/
│   ├── components/      # Composants réutilisables
│   │   ├── Card/       # Composants de cartes
│   │   ├── Layout/     # Navigation, routes protégées
│   │   └── UI/         # Composants UI (Button, Input, Modal)
│   ├── context/        # Context API (AuthContext)
│   ├── hooks/          # Hooks personnalisés
│   ├── pages/          # Pages de l'application
│   ├── services/       # Services (Firebase, MTG API, CSV parser)
│   └── types/          # Types TypeScript
├── firestore.rules     # Règles de sécurité Firestore
└── .env.local          # Variables d'environnement (à créer)
```

## Déploiement

### Déploiement sur Vercel

1. Installez Vercel CLI : `npm install -g vercel`
2. Connectez-vous : `vercel login`
3. Déployez : `vercel`
4. Ajoutez les variables d'environnement dans le dashboard Vercel

### Déploiement sur Netlify

1. Installez Netlify CLI : `npm install -g netlify-cli`
2. Connectez-vous : `netlify login`
3. Déployez : `netlify deploy --prod`
4. Ajoutez les variables d'environnement dans le dashboard Netlify

### Déploiement des règles Firestore

N'oubliez pas de déployer les règles Firestore :

```bash
firebase deploy --only firestore:rules
```

## API MTG Dev

L'application utilise l'API [MTG Dev](https://docs.magicthegathering.io) pour récupérer les informations sur les cartes.

- **Rate Limit** : 5000 requêtes par heure
- **Cache** : Les données sont mises en cache pour éviter les requêtes répétées
- **Gestion d'erreurs** : L'application gère automatiquement les erreurs de rate limit

## Technologies utilisées

- **React 18** - Bibliothèque UI
- **TypeScript** - Typage statique
- **Vite** - Build tool rapide
- **React Router** - Routing
- **Firebase** - Authentication et Firestore
- **Tailwind CSS** - Styling
- **MTG Dev API** - Données des cartes

## Sécurité

- ✅ Authentification requise pour toutes les pages (sauf login)
- ✅ Règles Firestore : accès uniquement aux données de l'utilisateur connecté
- ✅ Validation côté client et serveur
- ✅ Protection CSRF (gérée par Firebase)

## Support

Pour toute question ou problème, consultez :
- [Documentation Firebase](https://firebase.google.com/docs)
- [Documentation MTG Dev API](https://docs.magicthegathering.io)
- [Documentation React Router](https://reactrouter.com/)

## Licence

Ce projet est fourni tel quel, sans garantie.
