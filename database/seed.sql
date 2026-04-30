USE point_chaud;

INSERT INTO locations (name, address)
VALUES
('Route Freres', 'Route Freres, Port-au-Prince'),
('Petion-Ville', 'Petion-Ville'),
('Delmas', 'Delmas');

INSERT INTO users (name, email, password, role, phone, title, assigned_location_id, is_active)
VALUES
('Admin Principal', 'kieftraphterjoly@gmail.com', '$2b$10$lR3P.bZeDzsALoe5/K4aPeD.1CN9NUt2bnGN0KtLxbm/z7bV/vCwK', 'admin', '+50900000001', 'Administrateur principal', NULL, TRUE),
('Admin Secondaire', 'quelithog@gmail.com', '$2b$10$lR3P.bZeDzsALoe5/K4aPeD.1CN9NUt2bnGN0KtLxbm/z7bV/vCwK', 'admin', '+50900000002', 'Administrateur', NULL, TRUE),
('Manager Route Freres', 'route.manager@pointchaud.com', '$2b$10$eBvR4T57fFSCtNLSlsrFkOoAPo38rmkzbJW0Evl25uXkhk9tyQOgy', 'manager', '+50900000005', 'Manager de succursale', 1, TRUE),
('Manager Petion-Ville', 'petion.manager@pointchaud.com', '$2b$10$eBvR4T57fFSCtNLSlsrFkOoAPo38rmkzbJW0Evl25uXkhk9tyQOgy', 'manager', '+50900000006', 'Manager de succursale', 2, TRUE),
('Manager Delmas', 'manager@pointchaud.com', '$2b$10$eBvR4T57fFSCtNLSlsrFkOoAPo38rmkzbJW0Evl25uXkhk9tyQOgy', 'manager', '+50900000003', 'Manager de succursale', 3, TRUE),
('Livreur Route Freres', 'driver.route@pointchaud.com', '$2b$10$eBvR4T57fFSCtNLSlsrFkOoAPo38rmkzbJW0Evl25uXkhk9tyQOgy', 'driver', '+50900000007', 'Livreur', 1, TRUE),
('Livreur Petion-Ville', 'driver.petion@pointchaud.com', '$2b$10$eBvR4T57fFSCtNLSlsrFkOoAPo38rmkzbJW0Evl25uXkhk9tyQOgy', 'driver', '+50900000008', 'Livreur', 2, TRUE),
('Livreur Delmas', 'driver.delmas@pointchaud.com', '$2b$10$eBvR4T57fFSCtNLSlsrFkOoAPo38rmkzbJW0Evl25uXkhk9tyQOgy', 'driver', '+50900000009', 'Livreur', 3, TRUE),
('Client Demo', 'client@pointchaud.com', '$2b$10$Ceahr4tbYjrTPn/9jR3GVuIeWoUhyQ2qsihxYuM87jrb9OW9EIr7K', 'client', '+50900000004', 'Client', NULL, TRUE);

INSERT INTO categories (name)
VALUES
('Pain & Boulangerie'),
('Pates'),
('Pizza'),
('Burger & Sandwich'),
('Fritures / Snacks'),
('Plats chauds'),
('Boissons'),
('Cafe & boissons chaudes'),
('Desserts'),
('Extras / Complements');

INSERT INTO products (name, description, price, stock, category_id)
VALUES
('Pain chaud', 'Pain chaud fraichement sorti du four', 50.00, 120, 1),
('Pain au beurre', 'Pain moelleux au beurre', 65.00, 90, 1),
('Pain sandwich', 'Pain ideal pour sandwichs et garnitures', 55.00, 85, 1),
('Croissant', 'Croissant croustillant au beurre', 75.00, 70, 1),

('Pate poulet', 'Pate haitien au poulet', 100.00, 90, 2),
('Pate hareng', 'Pate haitien au hareng', 105.00, 65, 2),
('Pate boeuf', 'Pate haitien au boeuf', 110.00, 60, 2),
('Pate hot-dog', 'Pate fourre au hot-dog', 95.00, 75, 2),

('Pizza fromage', 'Pizza chaude au fromage fondant', 350.00, 30, 3),
('Pizza pepperoni', 'Pizza garnie de pepperoni', 400.00, 24, 3),
('Pizza poulet', 'Pizza au poulet assaisonne', 420.00, 22, 3),

('Burger classique', 'Burger classique avec boeuf et salade', 250.00, 40, 4),
('Burger poulet', 'Burger croustillant au poulet', 260.00, 38, 4),
('Sandwich jambon', 'Sandwich chaud au jambon', 180.00, 45, 4),
('Sandwich fromage', 'Sandwich chaud au fromage', 170.00, 42, 4),

('Poulet frit', 'Morceaux de poulet frit bien assaisonnes', 300.00, 35, 5),
('Banane pesee', 'Banane plantee frite', 120.00, 55, 5),
('Frites', 'Frites croustillantes', 140.00, 65, 5),
('Accras', 'Accras epices et croustillants', 130.00, 50, 5),

('Riz + poulet', 'Plat chaud riz accompagne de poulet', 450.00, 28, 6),
('Riz + hareng', 'Plat chaud riz accompagne de hareng', 430.00, 20, 6),
('Spaghetti', 'Spaghetti sauce tomate et epices', 220.00, 32, 6),

('Jus naturel', 'Jus frais de saison', 140.00, 55, 7),
('Jus orange', 'Jus d orange naturel', 150.00, 48, 7),
('Cola', 'Boisson gazeuse cola', 90.00, 80, 7),
('Malta', 'Boisson malta energisante', 110.00, 60, 7),
('Eau', 'Eau en bouteille', 50.00, 100, 7),

('Cafe', 'Cafe noir chaud', 80.00, 70, 8),
('Chocolat chaud', 'Boisson chaude au chocolat', 120.00, 35, 8),
('The', 'The chaud parfume', 75.00, 45, 8),

('Gateau', 'Part de gateau du jour', 150.00, 24, 9),
('Tarte', 'Part de tarte maison', 170.00, 18, 9),
('Biscuit', 'Biscuit sucre ou sale', 60.00, 75, 9),

('Sauce', 'Sauce maison en accompagnement', 25.00, 120, 10),
('Fromage extra', 'Supplement fromage', 40.00, 90, 10),
('Ketchup / mayo', 'Portion ketchup ou mayonnaise', 20.00, 140, 10);

INSERT INTO product_stocks (product_id, location_id, stock)
SELECT
  p.id,
  l.id,
  CASE
    WHEN l.id = 1 THEN FLOOR(p.stock / 3) + (p.stock % 3)
    ELSE FLOOR(p.stock / 3)
  END
FROM products p
CROSS JOIN locations l;

INSERT INTO bank_accounts (bank_name, account_name, account_number)
VALUES
('UNIBANK', 'Point Chaud', '123456789'),
('SOGEBANK', 'Point Chaud', '987654321'),
('BUH', 'Point Chaud', '456789123');
