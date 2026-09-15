# Consentement RGPD — configuration PocketBase

## Collection `legal`

Le composant `GDPRConsent` enregistre le consentement dans la collection PocketBase **`legal`** :

- Filtre : `userId`, `type = "gdpr-consent"` et `accepted = true`
- Un refus **ne crée pas** d'enregistrement : l'utilisateur est déconnecté et ne peut pas utiliser l'app

## Règles API

Voir [`pocketbase/api-rules.json`](../pocketbase/api-rules.json) (`legal` : propriétaire uniquement).

## Erreur « Missing or insufficient permissions »

1. Vérifier que la collection `legal` existe
2. Vérifier les règles API pour `list` et `create`
3. Vérifier que le champ `userId` est renseigné à la création du consentement

## Vérification

1. Créer un nouvel utilisateur ou supprimer son enregistrement `legal` existant
2. Se connecter → la modale RGPD doit s'afficher
3. Refuser → déconnexion et redirection `/login?consent=rejected`
4. Se reconnecter, accepter → un document `accepted: true` est créé dans `legal`
5. Recharger → la modale ne réapparaît pas
6. Page Profil → « Supprimer mon compte » efface les données liées puis déconnecte

## Références

- `src/components/Legal/GDPRConsent.tsx`
- `src/pages/Profile.tsx` (suppression de compte)
- [Privacy Policy](../src/pages/PrivacyPolicy.tsx)
- [SECURITY.md](./SECURITY.md)
- [POCKETBASE_API_RULES.md](./POCKETBASE_API_RULES.md)
