# Consentement RGPD — configuration PocketBase

## Collection `legal`

Le composant `GDPRConsent` enregistre le consentement dans la collection PocketBase **`legal`** :

- Filtre : `userId = "{uid}"` et `type = "gdpr-consent"`

## Règles API recommandées

Dans PocketBase Admin → Collections → `legal` :

- **List / View** : utilisateur authentifié, uniquement ses enregistrements (`userId = @request.auth.id`)
- **Create / Update** : même restriction
- **Delete** : propriétaire ou admin

Exemple de règle (à adapter à votre schéma) :

```
@request.auth.id != "" && userId = @request.auth.id
```

## Erreur « Missing or insufficient permissions »

1. Vérifier que la collection `legal` existe
2. Vérifier les règles API pour les opérations `list`, `create`
3. Vérifier que le champ `userId` est bien renseigné à la création du consentement

## Vérification

1. Créer un nouvel utilisateur ou supprimer son enregistrement `legal` existant
2. Se connecter → la modale RGPD doit s'afficher
3. Accepter → un document est créé dans `legal`
4. Recharger → la modale ne réapparaît pas

## Références

- `src/components/Legal/GDPRConsent.tsx`
- [Privacy Policy](../src/pages/PrivacyPolicy.tsx)
- [SECURITY.md](./SECURITY.md)
