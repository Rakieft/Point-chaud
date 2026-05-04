# Images produit Point Chaud

Place ici une image par produit.

## Format recommande

- format : `webp`
- largeur : `600px` a `800px`
- poids cible : `80 KB` a `250 KB`
- fond propre, image nette, cadrage horizontal

## Regle simple

Chaque produit doit idealement avoir un fichier nomme avec son slug :

- `pain-chaud.webp`
- `pate-poulet.webp`
- `pizza-fromage.webp`

## Liste recommandee des fichiers

- `pain-chaud.webp`
- `pain-au-beurre.webp`
- `pain-sandwich.webp`
- `croissant.webp`
- `pate-poulet.webp`
- `pate-hareng.webp`
- `pate-boeuf.webp`
- `pate-hot-dog.webp`
- `pizza-fromage.webp`
- `pizza-pepperoni.webp`
- `pizza-poulet.webp`
- `burger-classique.webp`
- `burger-poulet.webp`
- `sandwich-jambon.webp`
- `sandwich-fromage.webp`
- `poulet-frit.webp`
- `banane-pesee.webp`
- `frites.webp`
- `accras.webp`
- `riz-poulet.webp`
- `riz-hareng.webp`
- `spaghetti.webp`
- `jus-naturel.webp`
- `jus-orange.webp`
- `cola.webp`
- `malta.webp`
- `eau.webp`
- `cafe.webp`
- `chocolat-chaud.webp`
- `the.webp`
- `gateau.webp`
- `tarte.webp`
- `biscuit.webp`
- `sauce.webp`
- `fromage-extra.webp`
- `ketchup-mayo.webp`

## Verification rapide

Dans `backend`, lance :

```bash
npm run audit:images
```

Le script te dira :

- quels produits n'ont pas encore d'image
- quels fichiers sont trop lourds
- quelles references sont configurees mais manquantes
