# Configuration du premier administrateur

Ce guide explique comment créer le premier administrateur pour l'application MTG Collection.

## Prérequis

- Un compte Firebase configuré
- Accès à la Firebase Console
- Accès à Firestore Database

## Étapes de configuration

### 1. Créer le premier utilisateur dans Firebase Console

1. Allez sur [Firebase Console](https://console.firebase.google.com)
2. Sélectionnez votre projet
3. Allez dans **Authentication** > **Users**
4. Cliquez sur **Add user**
5. Entrez un email et un mot de passe pour le premier administrateur
6. Cliquez sur **Add user**

### 2. Définir le rôle admin dans Firestore

1. Dans Firebase Console, allez dans **Firestore Database**
2. Naviguez vers la collection `users`
3. Trouvez le document correspondant à l'UID de l'utilisateur créé (l'UID est visible dans Authentication > Users)
4. Créez la structure suivante si elle n'existe pas :
   ```
   users/
     {userId}/
       profile/
         data/
   ```
5. Dans le document `data`, ajoutez ou modifiez le champ `role` avec la valeur `"admin"` :
   ```json
   {
     "uid": "{userId}",
     "email": "admin@example.com",
     "role": "admin",
     "pseudonym": "Administrateur",
     "avatarId": "default",
     "createdAt": [timestamp],
     "updatedAt": [timestamp]
   }
   ```

### 3. Vérifier la configuration

1. Connectez-vous à l'application avec le compte admin créé
2. Vous devriez voir un lien "Admin" dans la barre de navigation
3. Cliquez sur "Admin" pour accéder à la page de gestion des utilisateurs

## Structure Firestore attendue

```
users/
  {userId}/
    profile/
      data/
        - uid: string
        - email: string
        - role: "admin" | "user"
        - pseudonym?: string
        - avatarId?: string
        - createdAt: timestamp
        - updatedAt: timestamp
```

## Créer d'autres administrateurs

Une fois le premier admin créé, vous pouvez :

1. Vous connecter avec le compte admin
2. Aller sur la page `/admin`
3. Créer de nouveaux utilisateurs
4. Définir leur rôle comme "admin" lors de la création ou via la modification

## Notes importantes

- Le rôle `admin` doit être défini explicitement dans Firestore
- Par défaut, tous les nouveaux utilisateurs ont le rôle `user`
- Seuls les administrateurs peuvent accéder à la page `/admin`
- Les règles Firestore permettent aux admins de modifier tous les profils utilisateur

## Dépannage

### Le lien Admin n'apparaît pas

1. Vérifiez que le champ `role` est bien défini à `"admin"` dans Firestore
2. Vérifiez que le chemin est correct : `users/{userId}/profile/data`
3. Déconnectez-vous et reconnectez-vous pour rafraîchir les permissions
4. Vérifiez la console du navigateur pour d'éventuelles erreurs

### Erreur d'accès à la page Admin

1. Vérifiez que les règles Firestore sont déployées :
   ```bash
   firebase deploy --only firestore:rules
   ```
2. Vérifiez que la fonction `isAdmin()` dans les règles Firestore fonctionne correctement
3. Assurez-vous que le document de profil existe et contient le champ `role`

## Sécurité

- Ne partagez jamais les identifiants d'administration
- Utilisez des mots de passe forts pour les comptes admin
- Limitez le nombre de comptes administrateurs
- Surveillez régulièrement les accès admin dans Firebase Console


