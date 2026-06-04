const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const db = require("../config/db");
const { distributeStock } = require("../utils/stock");

async function columnExists(table, column) {
  const [rows] = await db.query("SHOW COLUMNS FROM ?? LIKE ?", [table, column]);
  return rows.length > 0;
}

async function foreignKeyExists(table, foreignKey) {
  const [rows] = await db.query(
    `
      SELECT CONSTRAINT_NAME
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND CONSTRAINT_NAME = ?
    `,
    [table, foreignKey]
  );

  return rows.length > 0;
}

async function tableExists(table) {
  const [rows] = await db.query(
    `
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [table]
  );

  return rows.length > 0;
}

async function indexExists(table, indexName) {
  const [rows] = await db.query(
    `
      SELECT INDEX_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
    `,
    [table, indexName]
  );

  return rows.length > 0;
}

async function columnDefinitionIncludes(table, column, fragment) {
  const [rows] = await db.query(
    `
      SELECT COLUMN_TYPE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [table, column]
  );

  return rows.length ? String(rows[0].COLUMN_TYPE).includes(fragment) : false;
}

async function cleanupLegacyCatalogData() {
  const textFixes = [
    ["locations", "name", "Route FrÃ¨res", "Route Frères"],
    ["locations", "address", "Route FrÃ¨res, Port-au-Prince", "Route Frères, Port-au-Prince"],
    ["locations", "name", "PÃ©tion-Ville", "Pétion-Ville"],
    ["locations", "address", "PÃ©tion-Ville", "Pétion-Ville"],
    ["categories", "name", "PÃ¢tÃ©", "Pâté"],
    ["products", "name", "PÃ¢tÃ© poulet", "Pâté poulet"],
    ["products", "description", "PÃ¢tÃ© chaud", "Pâté chaud"],
    ["products", "name", "SÃ²s pwa ak diri blan", "Sòs pwa ak diri blan"],
    ["products", "name", "S?s pwa ak diri blan", "Sòs pwa ak diri blan"],
    ["products", "name", "Bouillon haÃ¯tien", "Bouillon haïtien"],
    ["products", "name", "Bouillon ha?tien", "Bouillon haïtien"]
  ];

  for (const [table, column, from, to] of textFixes) {
    await db.query(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, [to, from]);
  }

  await db.query(
    "DELETE FROM categories WHERE name IN ('Test Cat Temp', 'Juzzler') AND id NOT IN (SELECT DISTINCT category_id FROM products WHERE category_id IS NOT NULL)"
  );
  await db.query("DELETE FROM products WHERE name = 'Juzzler'");
}

async function run() {
  if (!(await tableExists("credit_payments"))) {
    await db.query(`
      CREATE TABLE credit_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        order_id INT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_channel VARCHAR(50) NULL,
        note TEXT NULL,
        recorded_by INT NULL,
        paid_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_credit_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_credit_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
        CONSTRAINT fk_credit_payments_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
  }

  if (!(await tableExists("security_events"))) {
    await db.query(`
      CREATE TABLE security_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        severity ENUM('info', 'warning', 'critical') DEFAULT 'info',
        user_id INT NULL,
        email VARCHAR(100) NULL,
        ip_address VARCHAR(80) NULL,
        details JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_security_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
  }

  if (!(await tableExists("promotions"))) {
    await db.query(`
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
      )
    `);
  }

  if (!(await tableExists("daily_specials"))) {
    await db.query(`
      CREATE TABLE daily_specials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        weekday ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday') NOT NULL,
        product_id INT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_daily_specials_weekday (weekday),
        CONSTRAINT fk_daily_specials_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      )
    `);
  }

  if (!(await tableExists("monthly_audit_reports"))) {
    await db.query(`
      CREATE TABLE monthly_audit_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_year INT NOT NULL,
        report_month INT NOT NULL,
        scope ENUM('global', 'location') DEFAULT 'global',
        location_id INT NULL,
        report_payload JSON NOT NULL,
        generated_by INT NULL,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_monthly_audit_scope (report_year, report_month, scope, location_id),
        CONSTRAINT fk_monthly_audit_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
        CONSTRAINT fk_monthly_audit_user FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
  }

  if (!(await tableExists("weekly_driver_reports"))) {
    await db.query(`
      CREATE TABLE weekly_driver_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        week_start_date DATE NOT NULL,
        week_end_date DATE NOT NULL,
        scope ENUM('global', 'location') DEFAULT 'global',
        location_id INT NULL,
        report_payload JSON NOT NULL,
        generated_by INT NULL,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_weekly_driver_scope (week_start_date, week_end_date, scope, location_id),
        CONSTRAINT fk_weekly_driver_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
        CONSTRAINT fk_weekly_driver_user FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
  }

    if (!(await tableExists("product_stocks"))) {
      await db.query(`
        CREATE TABLE product_stocks (
          id INT AUTO_INCREMENT PRIMARY KEY,
          product_id INT NOT NULL,
          location_id INT NOT NULL,
          stock INT DEFAULT 0,
          price_override DECIMAL(10,2) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_product_location (product_id, location_id),
          CONSTRAINT fk_product_stocks_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          CONSTRAINT fk_product_stocks_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
        )
      `);
    }

    if (!(await columnExists("product_stocks", "price_override"))) {
      await db.query("ALTER TABLE product_stocks ADD COLUMN price_override DECIMAL(10,2) NULL AFTER stock");
    }

  if (!(await columnDefinitionIncludes("users", "role", "'driver'"))) {
    await db.query("ALTER TABLE users MODIFY COLUMN role ENUM('client', 'admin', 'manager', 'driver') DEFAULT 'client'");
  }

  if (!(await columnExists("users", "phone"))) {
    await db.query("ALTER TABLE users ADD COLUMN phone VARCHAR(30) NULL AFTER password");
  }

  if (!(await columnExists("users", "credit_enabled"))) {
    await db.query("ALTER TABLE users ADD COLUMN credit_enabled BOOLEAN DEFAULT FALSE AFTER role");
  }

  if (!(await columnExists("users", "credit_limit"))) {
    await db.query("ALTER TABLE users ADD COLUMN credit_limit DECIMAL(10,2) DEFAULT 0 AFTER credit_enabled");
  }

  if (!(await columnExists("users", "credit_status"))) {
    await db.query(
      "ALTER TABLE users ADD COLUMN credit_status ENUM('inactive', 'active', 'suspended') DEFAULT 'inactive' AFTER credit_limit"
    );
  }

  if (!(await columnExists("users", "credit_note"))) {
    await db.query("ALTER TABLE users ADD COLUMN credit_note TEXT NULL AFTER credit_status");
  }

  if (!(await columnExists("users", "bio"))) {
    await db.query("ALTER TABLE users ADD COLUMN bio TEXT NULL AFTER phone");
  }

  if (!(await columnExists("users", "avatar_url"))) {
    await db.query("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255) NULL AFTER bio");
  }

  if (!(await columnExists("users", "title"))) {
    await db.query("ALTER TABLE users ADD COLUMN title VARCHAR(100) NULL AFTER avatar_url");
  }

  if (!(await columnExists("users", "oauth_provider"))) {
    await db.query("ALTER TABLE users ADD COLUMN oauth_provider ENUM('google', 'apple') NULL AFTER title");
  }

  if (!(await columnExists("users", "oauth_subject"))) {
    await db.query("ALTER TABLE users ADD COLUMN oauth_subject VARCHAR(255) NULL AFTER oauth_provider");
  }

  if (!(await columnExists("users", "email_verified"))) {
    await db.query("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE AFTER oauth_subject");
  }

  if (!(await columnExists("users", "email_verified_at"))) {
    await db.query("ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL AFTER email_verified");
  }

  if (!(await columnExists("users", "email_verification_token_hash"))) {
    await db.query("ALTER TABLE users ADD COLUMN email_verification_token_hash VARCHAR(255) NULL AFTER email_verified_at");
  }

  if (!(await columnExists("users", "email_verification_expires_at"))) {
    await db.query("ALTER TABLE users ADD COLUMN email_verification_expires_at DATETIME NULL AFTER email_verification_token_hash");
  }

  if (!(await columnExists("users", "password_reset_token_hash"))) {
    await db.query("ALTER TABLE users ADD COLUMN password_reset_token_hash VARCHAR(255) NULL AFTER email_verification_expires_at");
  }

  if (!(await columnExists("users", "password_reset_expires_at"))) {
    await db.query("ALTER TABLE users ADD COLUMN password_reset_expires_at DATETIME NULL AFTER password_reset_token_hash");
  }

  if (!(await columnExists("users", "assigned_location_id"))) {
    await db.query("ALTER TABLE users ADD COLUMN assigned_location_id INT NULL AFTER role");
  }

  if (!(await columnExists("users", "is_active"))) {
    await db.query("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER assigned_location_id");
  }

  await db.query(
    `
      UPDATE users
      SET email_verified = TRUE,
          email_verified_at = COALESCE(email_verified_at, NOW())
      WHERE role IN ('admin', 'manager', 'driver')
        AND (email_verified IS NULL OR email_verified = FALSE)
    `
  );

  await db.query(
    `
      UPDATE users
      SET email_verified = TRUE,
          email_verified_at = COALESCE(email_verified_at, NOW())
      WHERE email IN ('client@pointchaud.com')
        AND (email_verified IS NULL OR email_verified = FALSE)
    `
  );

  if (!(await columnExists("orders", "transaction_reference"))) {
    await db.query("ALTER TABLE orders ADD COLUMN transaction_reference VARCHAR(120) NULL AFTER payment_proof");
  }

  if (!(await columnDefinitionIncludes("orders", "payment_method", "'credit'"))) {
    await db.query(
      "ALTER TABLE orders MODIFY COLUMN payment_method ENUM('moncash', 'natcash', 'bank_transfer', 'credit')"
    );
  }

  if (!(await columnExists("orders", "credit_amount"))) {
    await db.query("ALTER TABLE orders ADD COLUMN credit_amount DECIMAL(10,2) DEFAULT 0 AFTER transaction_reference");
  }

  if (!(await columnExists("orders", "credit_settled_amount"))) {
    await db.query(
      "ALTER TABLE orders ADD COLUMN credit_settled_amount DECIMAL(10,2) DEFAULT 0 AFTER credit_amount"
    );
  }

  if (!(await columnExists("orders", "credit_settlement_status"))) {
    await db.query(
      "ALTER TABLE orders ADD COLUMN credit_settlement_status ENUM('none', 'open', 'partial', 'settled') DEFAULT 'none' AFTER credit_settled_amount"
    );
  }

  if (!(await columnExists("credit_payments", "payment_channel"))) {
    await db.query("ALTER TABLE credit_payments ADD COLUMN payment_channel VARCHAR(50) NULL AFTER amount");
  }

  if (!(await columnExists("orders", "notes"))) {
    await db.query("ALTER TABLE orders ADD COLUMN notes TEXT NULL AFTER transaction_reference");
  }

  if (!(await columnExists("orders", "order_type"))) {
    await db.query("ALTER TABLE orders ADD COLUMN order_type ENUM('pickup', 'delivery') DEFAULT 'pickup' AFTER pickup_time");
  }

  if (!(await columnExists("orders", "delivery_address"))) {
    await db.query("ALTER TABLE orders ADD COLUMN delivery_address VARCHAR(255) NULL AFTER order_type");
  }

  if (!(await columnExists("orders", "delivery_zone"))) {
    await db.query("ALTER TABLE orders ADD COLUMN delivery_zone VARCHAR(120) NULL AFTER delivery_address");
  }

  if (!(await columnExists("orders", "delivery_fee"))) {
    await db.query("ALTER TABLE orders ADD COLUMN delivery_fee DECIMAL(10,2) DEFAULT 0 AFTER delivery_zone");
  }

  if (!(await columnExists("orders", "delivery_status"))) {
    await db.query(
      "ALTER TABLE orders ADD COLUMN delivery_status ENUM('pending_assignment', 'assigned', 'out_for_delivery', 'delivered', 'return_to_branch') DEFAULT 'pending_assignment' AFTER delivery_fee"
    );
  }

  if (!(await columnDefinitionIncludes("orders", "delivery_status", "'return_to_branch'"))) {
    await db.query(
      "ALTER TABLE orders MODIFY COLUMN delivery_status ENUM('pending_assignment', 'assigned', 'out_for_delivery', 'delivered', 'return_to_branch') DEFAULT 'pending_assignment'"
    );
  }

  if (!(await columnExists("orders", "assigned_driver_id"))) {
    await db.query("ALTER TABLE orders ADD COLUMN assigned_driver_id INT NULL AFTER delivery_status");
  }

  if (!(await columnExists("orders", "delivered_at"))) {
    await db.query("ALTER TABLE orders ADD COLUMN delivered_at DATETIME NULL AFTER assigned_driver_id");
  }

  if (!(await columnExists("orders", "customer_received_at"))) {
    await db.query("ALTER TABLE orders ADD COLUMN customer_received_at DATETIME NULL AFTER delivered_at");
  }

  if (!(await columnExists("orders", "return_note"))) {
    await db.query("ALTER TABLE orders ADD COLUMN return_note TEXT NULL AFTER customer_received_at");
  }

  if (!(await columnExists("orders", "returned_at"))) {
    await db.query("ALTER TABLE orders ADD COLUMN returned_at DATETIME NULL AFTER return_note");
  }

  if (!(await columnExists("orders", "delivery_signature_name"))) {
    await db.query("ALTER TABLE orders ADD COLUMN delivery_signature_name VARCHAR(255) NULL AFTER returned_at");
  }

  if (!(await columnExists("orders", "delivery_signature_data"))) {
    await db.query("ALTER TABLE orders ADD COLUMN delivery_signature_data LONGTEXT NULL AFTER delivery_signature_name");
  }

  if (!(await columnExists("orders", "delivery_signature_captured_at"))) {
    await db.query(
      "ALTER TABLE orders ADD COLUMN delivery_signature_captured_at DATETIME NULL AFTER delivery_signature_data"
    );
  }

  if (!(await indexExists("orders", "uk_orders_qr_code_token"))) {
    await db.query("ALTER TABLE orders ADD UNIQUE KEY uk_orders_qr_code_token (qr_code_token)");
  }

  if (!(await foreignKeyExists("users", "fk_users_location"))) {
    await db.query(
      "ALTER TABLE users ADD CONSTRAINT fk_users_location FOREIGN KEY (assigned_location_id) REFERENCES locations(id)"
    );
  }

  if (!(await foreignKeyExists("orders", "fk_orders_driver"))) {
    await db.query(
      "ALTER TABLE orders ADD CONSTRAINT fk_orders_driver FOREIGN KEY (assigned_driver_id) REFERENCES users(id)"
    );
  }

  const [[locationCountRow]] = await db.query("SELECT COUNT(*) AS total FROM locations");
  const [[productStockCountRow]] = await db.query("SELECT COUNT(*) AS total FROM product_stocks");

  if (Number(locationCountRow.total) > 0 && Number(productStockCountRow.total) === 0) {
    const [products] = await db.query("SELECT id, stock FROM products ORDER BY id");
    const [locations] = await db.query("SELECT id FROM locations ORDER BY id");
    const locationIds = locations.map(location => Number(location.id));

    for (const product of products) {
      const distributedStocks = distributeStock(Number(product.stock || 0), locationIds);
      for (const item of distributedStocks) {
        await db.query(
          "INSERT INTO product_stocks (product_id, location_id, stock) VALUES (?, ?, ?)",
          [product.id, item.location_id, item.stock]
        );
      }
    }
  }

  const demoDrivers = [
    ["Livreur Route Freres", "driver.route@pointchaud.com", "$2b$10$eBvR4T57fFSCtNLSlsrFkOoAPo38rmkzbJW0Evl25uXkhk9tyQOgy", "+50900000007", 1],
    ["Livreur Petion-Ville", "driver.petion@pointchaud.com", "$2b$10$eBvR4T57fFSCtNLSlsrFkOoAPo38rmkzbJW0Evl25uXkhk9tyQOgy", "+50900000008", 2],
    ["Livreur Delmas", "driver.delmas@pointchaud.com", "$2b$10$eBvR4T57fFSCtNLSlsrFkOoAPo38rmkzbJW0Evl25uXkhk9tyQOgy", "+50900000009", 3]
  ];

  for (const [name, email, password, phone, locationId] of demoDrivers) {
    await db.query(
      `
        INSERT INTO users (name, email, password, phone, title, role, assigned_location_id, is_active)
        SELECT ?, ?, ?, ?, 'Livreur', 'driver', ?, TRUE
        WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = ?)
      `,
      [name, email, password, phone, locationId, email]
    );
  }

  const [[promotionCountRow]] = await db.query("SELECT COUNT(*) AS total FROM promotions");
  if (!(await columnExists("promotions", "product_id"))) {
    await db.query("ALTER TABLE promotions ADD COLUMN product_id INT NULL AFTER image");
  }

  if (!(await foreignKeyExists("promotions", "fk_promotions_product"))) {
    await db.query(
      "ALTER TABLE promotions ADD CONSTRAINT fk_promotions_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL"
    );
  }

  if (Number(promotionCountRow.total) === 0) {
    await db.query(
      `
        INSERT INTO promotions (title, price_label, description, image, period_label, kind, is_active, sort_order)
        VALUES
        (?, ?, ?, ?, ?, 'current', TRUE, 1),
        (?, ?, ?, NULL, ?, 'upcoming', TRUE, 1),
        (?, ?, ?, NULL, ?, 'upcoming', TRUE, 2),
        (?, ?, ?, NULL, ?, 'upcoming', TRUE, 3)
      `,
      [
        "Burger Week",
        "15$",
        "Les burgers stars sont en avant cette semaine.",
        "../assets/images/home/burger-week-promo.png",
        "En cours cette semaine",
        "Wing & Things",
        "15$",
        "Wings, frites et boissons pour les commandes de fin de semaine.",
        "Vendredi soir",
        "Midi Express",
        "15$",
        "Offres rapides sur les plats chauds pour booster les pauses déjeuner.",
        "La semaine prochaine",
        "Matin Point Chaud",
        "15$",
        "Pain chaud, pâtés et boissons chaudes dans une offre petit-déjeuner.",
        "Prochain lancement"
      ]
    );
  }

  const [[dailySpecialCountRow]] = await db.query("SELECT COUNT(*) AS total FROM daily_specials");
  if (Number(dailySpecialCountRow.total) === 0) {
    const fallbackTitlesByDay = {
      monday: "Diri lalo",
      tuesday: "Sòs pwa ak diri blan",
      wednesday: "Legim ak diri",
      thursday: "Diri kole ak poul",
      friday: "Griot ak bannann peze",
      saturday: "Tasso kabrit ak diri dyondyon",
      sunday: "Bouillon haïtien"
    };

    const weekdays = Object.keys(fallbackTitlesByDay);
    for (const weekday of weekdays) {
      const fallbackTitle = fallbackTitlesByDay[weekday];
      const [rows] = await db.query(
        `
          SELECT p.id
          FROM products p
          WHERE LOWER(p.name) = LOWER(?)
          LIMIT 1
        `,
        [fallbackTitle]
      );

      const productId = rows[0]?.id || null;
      await db.query(
        "INSERT INTO daily_specials (weekday, product_id, is_active) VALUES (?, ?, TRUE)",
        [weekday, productId]
      );
    }
  }

  await cleanupLegacyCatalogData();

  console.log("Migration terminee");
}

run()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error.message);
    process.exit(1);
  });
