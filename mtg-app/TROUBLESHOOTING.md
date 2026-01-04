# Guide de dépannage - Erreurs CORS Firebase Storage

## Erreur : "Access to XMLHttpRequest blocked by CORS policy"

Cette erreur se produit lorsque Firebase Storage n'est pas correctement configuré.

### Solution étape par étape

#### 1. Vérifier que Firebase Storage est activé

1. Allez sur [Firebase Console](https://console.firebase.google.com)
2. Sélectionnez votre projet
3. Dans le menu latéral, cliquez sur **Storage**
4. Si vous voyez "Get started" ou "Commencer", cliquez dessus
5. Choisissez **"Start in production mode"**
6. Sélectionnez un emplacement (recommandé : même région que Firestore)
7. Cliquez sur **"Done"**

#### 2. Vérifier la configuration dans .env.local

Votre fichier `.env.local` doit contenir :

```env
VITE_FIREBASE_STORAGE_BUCKET=mtg-base-68d21.firebasestorage.app
```

**Important** :
- Le format doit être : `{project-id}.firebasestorage.app`
- **SANS** le préfixe `gs://`
- **SANS** de slash à la fin

Pour trouver votre storageBucket :
1. Firebase Console > Storage
2. Onglet "Files"
3. Le bucket est affiché en haut (format : `gs://mtg-base-68d21.firebasestorage.app`)
4. Retirez `gs://` pour obtenir : `mtg-base-68d21.firebasestorage.app`

#### 3. Déployer les règles Storage

```bash
cd mtg-app
firebase deploy --only storage
```

Vous devriez voir :
```
✔  Deployed Storage rules successfully
```

#### 4. Vérifier les règles Storage

Dans Firebase Console > Storage > Rules, vous devriez voir :

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /avatars/{userId}.{extension} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId
                   && request.resource.size < 5 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

#### 5. Redémarrer le serveur

Après avoir modifié `.env.local`, **redémarrez toujours le serveur** :

```bash
# Arrêtez le serveur (Ctrl+C)
# Puis redémarrez
npm run dev
```

### Vérifications supplémentaires

#### Vérifier que Storage est bien initialisé

Ouvrez la console du navigateur (F12) et cherchez :
```
✅ Firebase Storage initialisé { storageBucket: "..." }
```

Si vous voyez `storageBucket: "non configuré"`, le problème vient de `.env.local`.

#### Vérifier les erreurs dans la console Firebase

1. Firebase Console > Storage
2. Onglet "Rules"
3. Vérifiez qu'il n'y a pas d'erreurs de syntaxe

### Erreurs courantes

#### "storageBucket is not defined"
- Vérifiez que `VITE_FIREBASE_STORAGE_BUCKET` est dans `.env.local`
- Redémarrez le serveur après modification

#### "Permission denied"
- Les règles Storage ne sont pas déployées
- Exécutez : `firebase deploy --only storage`

#### "Bucket not found"
- Firebase Storage n'est pas activé
- Activez-le dans Firebase Console > Storage

### Test rapide

Pour tester si Storage fonctionne, ouvrez la console du navigateur et tapez :

```javascript
// Vérifier que storage est initialisé
console.log(window.firebase?.storage);
```

Si c'est `undefined`, Firebase Storage n'est pas correctement configuré.

