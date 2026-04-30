# Point Chaud

Application web de commande en ligne pour point chaud avec:

- inscription et connexion
- catalogue produits
- stock par succursale
- panier et commande
- validation manager avant paiement
- envoi de preuve de paiement
- confirmation manuelle du paiement
- generation de QR code pour la recuperation
- mode livraison avec livreur
- dashboard admin / manager / client / livreur
- page caisse pour le comptoir
- rapports de ventes et alertes stock faible

## Stack

- Backend: Node.js + Express
- Base de donnees: MySQL
- Frontend: HTML + CSS + JavaScript

## Structure

- `backend/`: API Express
- `database/schema.sql`: structure MySQL
- `database/seed.sql`: donnees de base
- `frontend/pages/`: pages HTML
- `frontend/assets/`: CSS et JavaScript

## Installation

1. Creer la base de donnees avec `database/schema.sql`
2. Inserer les donnees avec `database/seed.sql`
3. Verifier le fichier `backend/.env`
4. Lancer le backend:

```bash
cd backend
npm install
npm run migrate
npm run smoke
npm run dev
```

5. Ouvrir le frontend via `frontend/pages/index.html`

## Comptes de demo

- Admin: `kieftraphterjoly@gmail.com` / `admin123`
- Admin: `quelithog@gmail.com` / `admin123`
- Manager: `manager@pointchaud.com` / `manager123`
- Manager Route Freres: `route.manager@pointchaud.com` / `manager123`
- Manager Petion-Ville: `petion.manager@pointchaud.com` / `manager123`
- Livreur Delmas: `driver.delmas@pointchaud.com` / `manager123`
- Livreur Route Freres: `driver.route@pointchaud.com` / `manager123`
- Livreur Petion-Ville: `driver.petion@pointchaud.com` / `manager123`
- Client: `client@pointchaud.com` / `client123`

Les clients peuvent creer leur compte depuis `register.html`.
Les comptes `admin` et `manager` doivent etre crees par un admin depuis le back-office.

## Flux principal

1. Le client ajoute des produits au panier
2. Il choisit le point chaud et l'horaire
3. Le manager valide ou refuse la commande
4. Le client envoie sa preuve de paiement
5. Le manager confirme le paiement
6. Le systeme genere un QR code
7. Le manager scanne ou confirme le token pour marquer la commande comme recuperee

## Parcours livraison

1. Le client choisit `Livraison`
2. Le manager valide la commande
3. Le client paie puis envoie la preuve
4. Le manager confirme le paiement
5. Un livreur de la bonne succursale est affecte
6. La livraison passe `assignee -> en route -> livree`

## Pages principales

- `frontend/pages/dashboard-admin.html`
- `frontend/pages/orders-pending.html`
- `frontend/pages/orders-validated.html`
- `frontend/pages/products.html`
- `frontend/pages/reports.html`
- `frontend/pages/scan-orders.html`
- `frontend/pages/cashier.html`
- `frontend/pages/dashboard-client.html`
- `frontend/pages/client-orders.html`
- `frontend/pages/deliveries.html`

## Points de retrait

- Route Freres
- Petion-Ville
- Delmas
