# Point Chaud

Application web de commande en ligne pour point chaud avec:

- inscription et connexion
- catalogue produits
- panier et commande
- validation manager avant paiement
- envoi de preuve de paiement
- confirmation manuelle du paiement
- generation de QR code pour la recuperation

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
npm run dev
```

5. Ouvrir le frontend via `frontend/pages/index.html`

## Comptes de demo

- Admin: `kieftraphterjoly@gmail.com` / `admin123`
- Admin: `quelithog@gmail.com` / `admin123`
- Manager: `manager@pointchaud.com` / `manager123`

Les clients peuvent creer leur compte depuis `register.html`.

## Flux principal

1. Le client ajoute des produits au panier
2. Il choisit le point chaud et l'horaire
3. Le manager valide ou refuse la commande
4. Le client envoie sa preuve de paiement
5. Le manager confirme le paiement
6. Le systeme genere un QR code
7. Le manager scanne ou confirme le token pour marquer la commande comme recuperee

## Points de retrait

- Route Freres
- Petion-Ville
- Delmas
