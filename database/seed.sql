USE point_chaud;

-- =========================
-- USERS (admin + manager)
-- =========================
INSERT INTO users (name, email, password, role, phone)
VALUES
('Admin Principal', 'kieftraphterjoly@gmail.com', '$2b$10$lR3P.bZeDzsALoe5/K4aPeD.1CN9NUt2bnGN0KtLxbm/z7bV/vCwK', 'admin', '+50900000001'),
('Admin Secondaire', 'quelithog@gmail.com', '$2b$10$lR3P.bZeDzsALoe5/K4aPeD.1CN9NUt2bnGN0KtLxbm/z7bV/vCwK', 'admin', '+50900000002'),
('Manager', 'manager@pointchaud.com', '$2b$10$eBvR4T57fFSCtNLSlsrFkOoAPo38rmkzbJW0Evl25uXkhk9tyQOgy', 'manager', '+50900000003'),
('Client Demo', 'client@pointchaud.com', '$2b$10$Ceahr4tbYjrTPn/9jR3GVuIeWoUhyQ2qsihxYuM87jrb9OW9EIr7K', 'client', '+50900000004');

-- =========================
-- LOCATIONS
-- =========================
INSERT INTO locations (name, address)
VALUES
('Route Frères', 'Route Frères, Port-au-Prince'),
('Pétion-Ville', 'Pétion-Ville'),
('Delmas', 'Delmas');

-- =========================
-- CATEGORIES
-- =========================
INSERT INTO categories (name)
VALUES
('Pain'),
('Pâté'),
('Boissons');

-- =========================
-- PRODUCTS
-- =========================
INSERT INTO products (name, description, price, stock, category_id)
VALUES
('Pain chaud', 'Pain frais', 50.00, 100, 1),
('Pâté poulet', 'Pâté chaud', 100.00, 50, 2),
('Jus orange', 'Jus naturel', 150.00, 30, 3);

-- =========================
-- BANK ACCOUNTS
-- =========================
INSERT INTO bank_accounts (bank_name, account_name, account_number)
VALUES
('UNIBANK', 'Point Chaud', '123456789'),
('SOGEBANK', 'Point Chaud', '987654321'),
('BUH', 'Point Chaud', '456789123');
