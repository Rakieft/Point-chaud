const fs = require("fs/promises");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const db = require("../config/db");
const { distributeStock } = require("../utils/stock");

function getUploadDir() {
  return path.resolve(__dirname, "..", process.env.UPLOAD_PATH || "uploads");
}

async function listFiles(targetDir) {
  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    return entries.filter(entry => entry.isFile()).map(entry => entry.name);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function clearUploadDirectory() {
  const uploadDir = getUploadDir();
  const files = await listFiles(uploadDir);

  for (const file of files) {
    await fs.unlink(path.join(uploadDir, file));
  }

  return {
    uploadDir,
    deletedFiles: files.length
  };
}

async function getSeedProducts() {
  const seedPath = path.resolve(__dirname, "..", "..", "database", "seed.sql");
  const content = await fs.readFile(seedPath, "utf8");
  const lines = content.split(/\r?\n/);
  const products = [];
  let inProducts = false;

  for (const line of lines) {
    if (line.includes("INSERT INTO products")) {
      inProducts = true;
      continue;
    }

    if (!inProducts) continue;
    if (!line.trim()) continue;
    if (line.includes("INSERT INTO product_stocks")) break;

    const match = line.match(/^\('([^']+)',\s*'[^']*',\s*[\d.]+,\s*(\d+),\s*\d+\),?$/);
    if (!match) continue;

    products.push({
      name: match[1],
      stock: Number(match[2])
    });
  }

  return products;
}

async function restoreSeedStocks(connection) {
  const [locations] = await connection.query("SELECT id FROM locations ORDER BY id");
  const locationIds = locations.map(location => Number(location.id));
  const seedProducts = await getSeedProducts();
  let restoredProducts = 0;

  for (const product of seedProducts) {
    const [[existing]] = await connection.query("SELECT id FROM products WHERE name = ? LIMIT 1", [product.name]);
    if (!existing) continue;

    const distributed = distributeStock(product.stock, locationIds);
    await connection.query("UPDATE products SET stock = ? WHERE id = ?", [product.stock, existing.id]);
    await connection.query("DELETE FROM product_stocks WHERE product_id = ?", [existing.id]);

    for (const item of distributed) {
      await connection.query(
        "INSERT INTO product_stocks (product_id, location_id, stock) VALUES (?, ?, ?)",
        [existing.id, item.location_id, item.stock]
      );
    }

    restoredProducts += 1;
  }

  return restoredProducts;
}

async function deleteQaCategories(connection) {
  const [rows] = await connection.query(
    `
      SELECT c.id, c.name
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      WHERE p.id IS NULL
        AND c.name LIKE 'Categorie QA%'
    `
  );

  for (const row of rows) {
    await connection.query("DELETE FROM categories WHERE id = ?", [row.id]);
  }

  return rows.map(row => ({ id: Number(row.id), name: row.name }));
}

async function restoreDemoStaffState(connection) {
  const demoAccounts = [
    ["kieftraphterjoly@gmail.com", "admin", null],
    ["quelithog@gmail.com", "admin", null],
    ["route.manager@pointchaud.com", "manager", 1],
    ["petion.manager@pointchaud.com", "manager", 2],
    ["manager@pointchaud.com", "manager", 3],
    ["driver.route@pointchaud.com", "driver", 1],
    ["driver.petion@pointchaud.com", "driver", 2],
    ["driver.delmas@pointchaud.com", "driver", 3],
    ["client@pointchaud.com", "client", null]
  ];

  for (const [email, role, assignedLocationId] of demoAccounts) {
    await connection.query(
      `
        UPDATE users
        SET role = ?, assigned_location_id = ?, is_active = TRUE
        WHERE email = ?
      `,
      [role, assignedLocationId, email]
    );
  }

  return demoAccounts.length;
}

async function main() {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[countsBefore]] = await connection.query(
      `
        SELECT
          (SELECT COUNT(*) FROM orders) AS orders_total,
          (SELECT COUNT(*) FROM order_items) AS order_items_total,
          (SELECT COUNT(*) FROM notifications) AS notifications_total
      `
    );

    await connection.query("DELETE FROM order_items");
    await connection.query("DELETE FROM orders");
    await connection.query("DELETE FROM notifications");

    await connection.query("ALTER TABLE order_items AUTO_INCREMENT = 1");
    await connection.query("ALTER TABLE orders AUTO_INCREMENT = 1");
    await connection.query("ALTER TABLE notifications AUTO_INCREMENT = 1");

    const restoredProducts = await restoreSeedStocks(connection);
    const deletedQaCategories = await deleteQaCategories(connection);
    const restoredDemoAccounts = await restoreDemoStaffState(connection);

    await connection.commit();

    const uploadCleanup = await clearUploadDirectory();

    console.log(
      JSON.stringify(
        {
          message: "Etat de test reinitialise",
          cleared: {
            orders: Number(countsBefore.orders_total || 0),
            orderItems: Number(countsBefore.order_items_total || 0),
            notifications: Number(countsBefore.notifications_total || 0)
          },
          restoredProducts,
          restoredDemoAccounts,
          deletedQaCategories,
          uploadCleanup
        },
        null,
        2
      )
    );
  } catch (error) {
    await connection.rollback();
    console.error("Echec du reset de test:", error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await db.end();
  }
}

main();
