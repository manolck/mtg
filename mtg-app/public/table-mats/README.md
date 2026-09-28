# Tapis de jeu

Ajoutez des images dans ce dossier (`public/table-mats/`). Elles sont servies sous `/table-mats/`, hors de la route `/play` de l’app.

1. Déposez un fichier `png`, `jpg`, `webp`, `avif`, `svg` ou `gif`.
2. Déclarez-le dans `index.json` :

```json
{
  "mats": [
    { "id": "canopy", "file": "canopy.jpg", "label": "Canopée" }
  ]
}
```

- `id` : identifiant unique (lettres, chiffres, `.` `_` `-`), différent de `battlefield`, `enchant`, `terrain`.
- `file` : nom du fichier dans ce dossier, sans sous-dossier.
- `label` : nom affiché dans le menu.

Rebuild / redéploie le front pour que les nouveaux fichiers soient en ligne.

Le tapis est lié au joueur et synchronisé : les autres voient le tapis qu’il a choisi.
Le format paysage (environ 16:9 ou 3:2) convient le mieux.
