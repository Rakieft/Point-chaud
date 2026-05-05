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

async function run() {
  if (!(await tableExists("product_stocks"))) {
    await db.query(`
      CREATE TABLE product_stocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        location_id INT NOT NULL,
        stock INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_product_location (product_id, location_id),
        CONSTRAINT fk_product_stocks_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        CONSTRAINT fk_product_stocks_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
      )
    `);
  }

  if (!(await columnDefinitionIncludes("users", "role", "'driver'"))) {
    await db.query("ALTER TABLE users MODIFY COLUMN role ENUM('client', 'admin', 'manager', 'driver') DEFAULT 'client'");
  }

  if (!(await columnExists("users", "phone"))) {
    await db.query("ALTER TABLE users ADD COLUMN phone VARCHAR(30) NULL AFTER password");
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

  if (!(await columnExists("users", "assigned_location_id"))) {
    await db.query("ALTER TABLE users ADD COLUMN assigned_location_id INT NULL AFTER role");
  }

  if (!(await columnExists("users", "is_active"))) {
    await db.query("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER assigned_location_id");
  }

  if (!(await columnExists("orders", "transaction_reference"))) {
    await db.query("ALTER TABLE orders ADD COLUMN transaction_reference VARCHAR(120) NULL AFTER payment_proof");
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

  if (!(await columnExists("orders", "return_note"))) {
    await db.query("ALTER TABLE orders ADD COLUMN return_note TEXT NULL AFTER delivered_at");
  }

  if (!(await columnExists("orders", "returned_at"))) {
    await db.query("ALTER TABLE orders ADD COLUMN returned_at DATETIME NULL AFTER return_note");
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

  console.log("Migration terminee");
}

run()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error.message);
    process.exit(1);
  });
