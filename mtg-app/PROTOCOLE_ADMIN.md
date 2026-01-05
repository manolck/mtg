# Protocole de création du premier administrateur

Ce document décrit les différentes méthodes pour créer le premier administrateur de l'application MTG Collection.

## Méthode 1 : Via Firebase Console (Recommandée - Simple)

### Étape 1 : Créer l'utilisateur dans Firebase Authentication

1. Allez sur [Firebase Console](https://console.firebase.google.com)
2. Sélectionnez votre projet Firebase
3. Dans le menu latéral, cliquez sur **Authentication**
4. Allez dans l'onglet **Users**
5. Cliquez sur **Add user** (ou **Ajouter un utilisateur**)
6. Remplissez le formulaire :
   - **Email** : Entrez l'email de l'administrateur (ex: `admin@example.com`)
   - **Password** : Entrez un mot de passe sécurisé (minimum 6 caractères)
7. Cliquez sur **Add user** (ou **Ajouter**)
8. **Important** : Notez l'**UID** de l'utilisateur créé (visible dans la liste des utilisateurs)

### Étape 2 : Définir le rôle admin dans Firestore

1. Dans Firebase Console, allez dans **Firestore Database**
2. Si la collection `users` n'existe pas, elle sera créée automatiquement
3. Créez la structure suivante :
   ```
   users/
     {UID}/
       profile/
         data/
   ```
   Où `{UID}` est l'UID de l'utilisateur créé à l'étape 1

4. Dans le document `data`, créez/modifiez les champs suivants :
   ```json
   {
     "uid": "{UID}",
     "email": "admin@example.com",
     "role": "admin",
     "pseudonym": "Administrateur",
     "avatarId": "default",
     "createdAt": [Timestamp - Date actuelle],
     "updatedAt": [Timestamp - Date actuelle]
   }
   ```

5. **Important** : Le champ `role` doit être défini à `"admin"` (avec les guillemets)

### Étape 3 : Vérifier la configuration

1. Ouvrez votre application dans le navigateur
2. Connectez-vous avec l'email et le mot de passe créés
3. Vous devriez voir un lien **"Admin"** dans la barre de navigation
4. Cliquez sur **"Admin"** pour accéder à la page de gestion des utilisateurs

## Méthode 2 : Via le script Node.js (Avancée - Automatisée)

### Prérequis

1. Installer Firebase Admin SDK :
   ```bash
   npm install firebase-admin
   ```

2. Obtenir les credentials de service :
   - Allez dans Firebase Console > **Project Settings** > **Service Accounts**
   - Cliquez sur **Generate new private key**
   - Téléchargez le fichier JSON
   - Placez-le dans le projet sous le nom `serviceAccountKey.json`
   - **Important** : Ajoutez `serviceAccountKey.json` à `.gitignore` pour ne pas le commiter

### Exécution du script

```bash
# Depuis la racine du projet mtg-app
node scripts/setup-admin.js
```

Le script vous demandera :
- Email de l'administrateur
- Mot de passe (2 fois pour confirmation)
- Pseudonyme (optionnel)

Le script créera automatiquement :
- L'utilisateur dans Firebase Authentication
- Le profil avec le rôle `admin` dans Firestore

### Alternative avec variable d'environnement

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=./path/to/serviceAccountKey.json node scripts/setup-admin.js
```

## Méthode 3 : Via l'API REST Firebase (Sans Admin SDK)

Cette méthode utilise l'API REST Firebase Identity Toolkit directement.

### Étape 1 : Créer l'utilisateur via l'API REST

Utilisez curl ou un outil similaire :

```bash
curl -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "votre_mot_de_passe",
    "returnSecureToken": true
  }'
```

Remplacez :
- `YOUR_API_KEY` par votre clé API Firebase (trouvable dans `.env.local` ou Firebase Console)
- `admin@example.com` par l'email de l'admin
- `votre_mot_de_passe` par le mot de passe

La réponse contiendra un `localId` (l'UID de l'utilisateur).

### Étape 2 : Créer le profil dans Firestore

Utilisez l'API REST Firestore ou Firebase Console pour créer le document :

```json
{
  "uid": "{localId_de_la_reponse}",
  "email": "admin@example.com",
  "role": "admin",
  "pseudonym": "Administrateur",
  "avatarId": "default",
  "createdAt": [Timestamp],
  "updatedAt": [Timestamp]
}
```

Chemin Firestore : `users/{localId}/profile/data`

## Structure Firestore attendue

```
users/
  {userId}/
    profile/
      data/
        - uid: string (requis)
        - email: string (requis)
        - role: "admin" | "user" (requis, doit être "admin" pour un admin)
        - pseudonym?: string (optionnel)
        - avatarId?: string (optionnel, défaut: "default")
        - createdAt: timestamp (requis)
        - updatedAt: timestamp (requis)
```

## Vérification du rôle admin

Pour vérifier qu'un utilisateur est bien admin :

1. Dans Firestore, allez à `users/{userId}/profile/data`
2. Vérifiez que le champ `role` existe et vaut `"admin"` (avec les guillemets)
3. Le type doit être `string`, pas `number` ou autre

## Dépannage

### Le lien "Admin" n'apparaît pas

**Causes possibles :**
1. Le champ `role` n'est pas défini à `"admin"` dans Firestore
2. Le chemin Firestore est incorrect (doit être `users/{userId}/profile/data`)
3. Le document de profil n'existe pas
4. L'utilisateur n'est pas connecté

**Solutions :**
1. Vérifiez dans Firestore que `users/{userId}/profile/data.role === "admin"`
2. Déconnectez-vous et reconnectez-vous pour rafraîchir les permissions
3. Vérifiez la console du navigateur (F12) pour d'éventuelles erreurs
4. Vérifiez que les règles Firestore sont déployées :
   ```bash
   firebase deploy --only firestore:rules
   ```

### Erreur "Accès refusé" sur /admin

**Causes possibles :**
1. Les règles Firestore ne permettent pas la lecture du profil
2. La fonction `isAdmin()` dans les règles Firestore ne fonctionne pas

**Solutions :**
1. Vérifiez que les règles Firestore sont à jour et déployées
2. Vérifiez que le document de profil existe et contient le champ `role`
3. Vérifiez les logs Firestore dans Firebase Console pour voir les règles qui bloquent

### L'utilisateur existe mais n'a pas de profil

**Solution :**
Créez manuellement le document dans Firestore :
- Chemin : `users/{userId}/profile/data`
- Contenu : Voir la structure ci-dessus avec `role: "admin"`

## Créer d'autres administrateurs

Une fois le premier admin créé :

1. Connectez-vous avec le compte admin
2. Allez sur la page `/admin`
3. Cliquez sur **"+ Créer un utilisateur"**
4. Remplissez le formulaire :
   - Email
   - Mot de passe
   - Rôle : Sélectionnez **"Admin"**
5. Cliquez sur **"Créer"**

Vous pouvez aussi modifier un utilisateur existant pour le promouvoir admin :
1. Dans la liste des utilisateurs, cliquez sur **"Modifier"**
2. Changez le rôle de **"Utilisateur"** à **"Admin"**
3. Cliquez sur **"Enregistrer"**

## Sécurité

### Bonnes pratiques

- ✅ Utilisez des mots de passe forts (minimum 12 caractères, mélange de lettres, chiffres, symboles)
- ✅ Ne partagez jamais les identifiants d'administration
- ✅ Limitez le nombre de comptes administrateurs (principe du moindre privilège)
- ✅ Surveillez régulièrement les accès admin dans Firebase Console
- ✅ Utilisez l'authentification à deux facteurs si possible
- ✅ Ne commitez jamais `serviceAccountKey.json` dans Git

### Fichiers à ajouter à .gitignore

```
serviceAccountKey.json
*.serviceAccountKey.json
.env.local
```

## Commandes utiles

### Déployer les règles Firestore

```bash
firebase deploy --only firestore:rules
```

### Vérifier la configuration Firebase

```bash
firebase projects:list
```

### Tester les règles Firestore localement

```bash
firebase emulators:start --only firestore
```

## Support

Si vous rencontrez des problèmes :

1. Vérifiez les logs dans Firebase Console > Firestore > Usage
2. Vérifiez la console du navigateur (F12) pour les erreurs JavaScript
3. Vérifiez que toutes les variables d'environnement sont correctement configurées
4. Consultez la documentation Firebase : https://firebase.google.com/docs

## Résumé rapide (Méthode 1)

1. Firebase Console > Authentication > Add user
2. Notez l'UID
3. Firestore > Créer `users/{UID}/profile/data` avec `role: "admin"`
4. Se connecter à l'application
5. Le lien "Admin" apparaît dans la navbar


