# Point Chaud

Application web de commande, paiement differe, retrait QR et livraison pour point chaud.

## Ce que le projet couvre

- authentification `client`, `manager`, `admin`, `livreur`
- catalogue produits avec categories
- stock par succursale
- panier, checkout, commandes client
- validation manager avant paiement
- preuve de paiement et confirmation manuelle
- QR code pour retrait
- caisse / scan
- livraison avec affectation de livreur par succursale
- dashboards `client`, `admin`, `manager`, `livreur`
- rapports, analytics, maintenance des preuves de paiement

## Stack

- Backend : `Node.js + Express`
- Base de donnees : `MySQL`
- Frontend : `HTML + CSS + JavaScript`

## Structure

- [backend](C:\Users\kieft\Desktop\Point-chaud\Point-chaud\backend)
- [database/schema.sql](C:\Users\kieft\Desktop\Point-chaud\Point-chaud\database\schema.sql)
- [database/seed.sql](C:\Users\kieft\Desktop\Point-chaud\Point-chaud\database\seed.sql)
- [frontend/pages](C:\Users\kieft\Desktop\Point-chaud\Point-chaud\frontend\pages)
- [frontend/assets](C:\Users\kieft\Desktop\Point-chaud\Point-chaud\frontend\assets)

## Installation locale

1. Creer la base MySQL `point_chaud`
2. Importer `database/schema.sql`
3. Importer `database/seed.sql`
4. Copier `backend/.env.example` vers `backend/.env`
5. Ajuster les variables MySQL dans `.env`
6. Lancer :

```bash
cd backend
npm install
npm run migrate
npm run smoke
npm run dev
```

7. Ouvrir ensuite :

- `http://localhost:5000`

Le frontend peut encore fonctionner en `file://`, mais pour un usage propre il faut maintenant passer par le serveur Express.

## Comptes de demo

- Admin : `kieftraphterjoly@gmail.com` / `admin123`
- Admin : `quelithog@gmail.com` / `admin123`
- Manager Delmas : `manager@pointchaud.com` / `manager123`
- Manager Route Freres : `route.manager@pointchaud.com` / `manager123`
- Manager Petion-Ville : `petion.manager@pointchaud.com` / `manager123`
- Livreur Delmas : `driver.delmas@pointchaud.com` / `manager123`
- Livreur Route Freres : `driver.route@pointchaud.com` / `manager123`
- Livreur Petion-Ville : `driver.petion@pointchaud.com` / `manager123`
- Client : `client@pointchaud.com` / `client123`

## Scripts utiles

Dans [backend](C:\Users\kieft\Desktop\Point-chaud\Point-chaud\backend) :

```bash
npm run dev
npm run start
npm run migrate
npm run smoke
npm run audit:images
npm run reset:test
npm run cleanup:proofs
```

## Mode production

Le projet est maintenant prepare pour un hebergement simple :

- le frontend est servi par Express
- les assets sont servis sous `/assets`
- les pages sont servies sous `/pages`
- les uploads sont servis sous `/uploads`
- l’API est accessible sous `/api`
- une route de sante existe sur `/api/health`

Le frontend detecte automatiquement :

- `http://localhost:5000/api` en mode `file://`
- `window.location.origin + /api` en mode heberge

## Variables d’environnement

Voir [backend/.env.example](C:\Users\kieft\Desktop\Point-chaud\Point-chaud\backend\.env.example)

Variables importantes :

- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `PORT`
- `NODE_ENV`
- `UPLOAD_PATH`
- `CORS_ORIGINS`
- `SMS_PROVIDER`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `PROOF_RETENTION_DAYS`
- `PROOF_CLEANUP_INTERVAL_HOURS`

## Hebergement simple sans Docker

1. Heberger MySQL
2. Mettre les bonnes variables dans `backend/.env`
3. Installer les dependances :

```bash
cd backend
npm install
```

4. Lancer la migration :

```bash
npm run migrate
```

5. Demarrer le serveur :

```bash
npm start
```

6. Ouvrir le domaine du serveur

## Hebergement avec Docker

Depuis la racine du projet :

```bash
docker build -t point-chaud .
docker run --env-file backend/.env -p 5000:5000 point-chaud
```

## Checklist avant mise en ligne

- remplacer `JWT_SECRET`
- verifier `CORS_ORIGINS`
- utiliser une vraie base MySQL de production
- activer Twilio si tu veux les vrais SMS
- verifier les comptes staff reels
- verifier l’espace disque du dossier `uploads`
- mettre en place une sauvegarde de la base

## Remise a zero de test

Pour effacer les commandes, notifications, preuves de paiement et remettre les stocks seed :

```bash
cd backend
npm run reset:test
```

## Images produit

Le projet est pret pour des images produit legeres et propres :

- dossier : [frontend/assets/images/products](C:\Users\kieft\Desktop\Point-chaud\Point-chaud\frontend\assets\images\products)
- format recommande : `webp`
- largeur conseillee : `600px` a `800px`
- poids ideal : `80 KB` a `250 KB`

Pour verifier rapidement si les images sont bien nommees et pas trop lourdes :

```bash
cd backend
npm run audit:images
```

La convention de noms recommandee est documentee dans :

- [frontend/assets/images/products/README.md](C:\Users\kieft\Desktop\Point-chaud\Point-chaud\frontend\assets\images\products\README.md)

## Etat actuel

Le projet est pret pour :

- demonstration serieuse
- soutenance
- hebergement simple
- usage local avance

Ce qu’il restera a faire pour une vraie production lourde :

- SMS Twilio actif
- sauvegardes automatiques
- supervision serveur
- HTTPS + domaine definitif
- eventuels tests automatises supplementaires
