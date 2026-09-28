# Tapis de jeu

Ajoutez des images dans ce dossier pour les proposer comme tapis de champ de bataille.

1. Déposez un fichier `png`, `jpg`, `webp`, `avif`, `svg` ou `gif`.
2. Déclarez-le dans `index.json` :

```json
{
  "mats": [
    { "id": "canopy", "file": "canopy.svg", "label": "Canopée" }
  ]
}
```

- `id` : identifiant unique (lettres, chiffres, `.` `_` `-`), différent de `battlefield`, `enchant`, `terrain`.
- `file` : nom du fichier dans ce dossier, sans sous-dossier.
- `label` : nom affiché dans le menu.

Le tapis est lié au joueur et synchronisé : les autres voient le tapis qu’il a choisi.
Le format paysage (environ 16:9 ou 3:2) convient le mieux.
