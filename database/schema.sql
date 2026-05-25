CREATE DATABASE IF NOT EXISTS point_chaud;
USE point_chaud;

-- =========================
-- USERS
-- =========================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    phone VARCHAR(30),
    role ENUM('client', 'admin', 'manager', 'driver') DEFAULT 'client',
    oauth_provider ENUM('google', 'apple') NULL,
    oauth_subject VARCHAR(255) NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at DATETIME NULL,
    email_verification_token_hash VARCHAR(255) NULL,
    email_verification_expires_at DATETIME NULL,
    password_reset_token_hash VARCHAR(255) NULL,
    password_reset_expires_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- LOCATIONS (Points Chauds)
-- =========================
CREATE TABLE locations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    address VARCHAR(255)
);

-- =========================
-- CATEGORIES
-- =========================
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100)
);

-- =========================
-- PRODUCTS
-- =========================
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    description TEXT,
    price DECIMAL(10,2),
    image VARCHAR(255),
    stock INT DEFAULT 0,
    category_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- =========================
-- BANK ACCOUNTS
-- =========================
CREATE TABLE bank_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bank_name VARCHAR(100),
    account_name VARCHAR(100),
    account_number VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- ORDERS
-- =========================
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,

    -- Statut global
    status ENUM(
        'pending_validation',
        'validated',
        'awaiting_payment',
        'paid',
        'completed',
        'cancelled'
    ) DEFAULT 'pending_validation',

    -- Lieu & récupération
    location_id INT,
    pickup_date DATE,
    pickup_time TIME,

    -- Paiement
    payment_method ENUM('moncash', 'natcash', 'bank_transfer'),
    payment_status ENUM('pending', 'confirmed', 'rejected') DEFAULT 'pending',
    payment_proof VARCHAR(255),
    transaction_reference VARCHAR(120),
    notes TEXT,
    order_type ENUM('pickup', 'delivery') DEFAULT 'pickup',
    delivery_address VARCHAR(255),
    delivery_zone VARCHAR(120),
    delivery_fee DECIMAL(10,2) DEFAULT 0,
    delivery_status ENUM('pending_assignment', 'assigned', 'out_for_delivery', 'delivered', 'return_to_branch') DEFAULT 'pending_assignment',
    assigned_driver_id INT NULL,
    delivered_at DATETIME NULL,
    customer_received_at DATETIME NULL,
    return_note TEXT NULL,
    returned_at DATETIME NULL,
    delivery_signature_name VARCHAR(255) NULL,
    delivery_signature_data LONGTEXT NULL,
    delivery_signature_captured_at DATETIME NULL,

    -- Validation commande
    validated_by INT,
    validated_at DATETIME,

    -- Confirmation paiement
    confirmed_by INT,
    confirmed_at DATETIME,

    -- QR Code
    qr_code_token VARCHAR(255),
    UNIQUE KEY uk_orders_qr_code_token (qr_code_token),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (location_id) REFERENCES locations(id),
    FOREIGN KEY (validated_by) REFERENCES users(id),
    FOREIGN KEY (confirmed_by) REFERENCES users(id),
    FOREIGN KEY (assigned_driver_id) REFERENCES users(id)
);

-- =========================
-- ORDER ITEMS
-- =========================
CREATE TABLE order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT,
    product_id INT,
    quantity INT,
    price DECIMAL(10,2),

    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- =========================
-- NOTIFICATIONS
-- =========================
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================
-- SECURITY EVENTS
-- =========================
CREATE TABLE security_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    severity ENUM('info', 'warning', 'critical') DEFAULT 'info',
    user_id INT NULL,
    email VARCHAR(100) NULL,
    ip_address VARCHAR(80) NULL,
    details JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =========================
-- PROMOTIONS & DAILY SPECIALS
-- =========================
CREATE TABLE promotions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    price_label VARCHAR(50) NULL,
    description TEXT NULL,
    image VARCHAR(255) NULL,
    period_label VARCHAR(120) NULL,
    kind ENUM('current', 'upcoming') DEFAULT 'upcoming',
    start_date DATE NULL,
    end_date DATE NULL,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE daily_specials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    weekday ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday') NOT NULL,
    product_id INT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_daily_specials_weekday (weekday),
    CONSTRAINT fk_daily_specials_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);
