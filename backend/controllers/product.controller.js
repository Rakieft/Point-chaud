const db = require("../config/db");
const {
  ensureLocationStockRows,
  fetchLocationStocksForProducts,
  getLocations,
  normalizeLocationStocks,
  setProductLocationStocks
} = require("../utils/stock");

function parseLocationStocks(value) {
  if (!value) return null;
  if (Array.isArray(value) || typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

async function fetchProductById(productId) {
  const [rows] = await db.query(
    `
      SELECT
        p.id,
        p.name,
        p.description,
        p.price,
        p.image,
        p.stock,
        p.category_id,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?
    `,
    [productId]
  );

  const product = rows[0] || null;
  if (!product) return null;

  const stocksMap = await fetchLocationStocksForProducts(db, [Number(productId)]);
  return {
    ...product,
    stock: Number(product.stock || 0),
    location_stocks: stocksMap.get(Number(productId)) || []
  };
}

exports.getCatalog = async (req, res) => {
  try {
    const locationId = req.query.location_id ? Number(req.query.location_id) : null;
    const [products] = await db.query(`
      SELECT
        p.id,
        p.name,
        p.description,
        p.price,
        p.image,
        p.stock,
        p.category_id,
        c.name AS category_name,
        ${locationId ? "COALESCE(MAX(CASE WHEN ps.location_id = ? THEN ps.stock END), 0)" : "NULL"} AS location_stock
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_stocks ps ON ps.product_id = p.id
      GROUP BY p.id, p.name, p.description, p.price, p.image, p.stock, p.category_id, c.name
      ORDER BY c.name, p.name
    `, locationId ? [locationId] : []);

    const productIds = products.map(product => Number(product.id));
    const stocksMap = await fetchLocationStocksForProducts(db, productIds);

    const [categories] = await db.query("SELECT * FROM categories ORDER BY name");
    const locations = await getLocations();
    const [bankAccounts] = await db.query("SELECT * FROM bank_accounts ORDER BY bank_name");

    res.json({
      products: products.map(product => ({
        ...product,
        stock: Number(product.stock || 0),
        location_stock: product.location_stock === null ? null : Number(product.location_stock || 0),
        location_stocks: stocksMap.get(Number(product.id)) || []
      })),
      categories,
      locations,
      bankAccounts,
      paymentMethods: [
        { key: "moncash", label: "MonCash" },
        { key: "natcash", label: "NatCash" },
        { key: "bank_transfer", label: "Virement bancaire" }
      ]
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer le catalogue", error: error.message });
  }
};

exports.createProduct = async (req, res) => {
  const { name, description, price, stock, category_id, image } = req.body;
  const location_stocks = parseLocationStocks(req.body.location_stocks);

  if (!name || !price || !category_id) {
    return res.status(400).json({ message: "Nom, prix et categorie sont obligatoires" });
  }

  try {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `INSERT INTO products (name, description, price, stock, category_id, image)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, description || null, price, stock || 0, category_id, image || null]
      );

      const locations = await getLocations(connection);
      const normalizedStocks = normalizeLocationStocks(location_stocks, locations, Number(stock || 0));
      await setProductLocationStocks(connection, result.insertId, normalizedStocks);

      await connection.commit();
      const product = await fetchProductById(result.insertId);
      res.status(201).json(product);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ message: "Impossible d'ajouter le produit", error: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  const { name, description, price, stock, category_id, image } = req.body;
  const location_stocks = parseLocationStocks(req.body.location_stocks);

  if (!name || !price || !category_id) {
    return res.status(400).json({ message: "Nom, prix et categorie sont obligatoires" });
  }

  try {
    const product = await fetchProductById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();
      await ensureLocationStockRows(connection, req.params.id, Number(product.stock || 0));

      await connection.query(
        `
          UPDATE products
          SET name = ?, description = ?, price = ?, category_id = ?, image = ?
          WHERE id = ?
        `,
        [name, description || null, price, category_id, image || null, req.params.id]
      );

      const locations = await getLocations(connection);
      const normalizedStocks = normalizeLocationStocks(
        location_stocks,
        locations,
        Number(stock || product.stock || 0)
      );
      await setProductLocationStocks(connection, req.params.id, normalizedStocks);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const updatedProduct = await fetchProductById(req.params.id);
    res.json({ message: "Produit mis a jour", product: updatedProduct });
  } catch (error) {
    res.status(500).json({ message: "Impossible de modifier le produit", error: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const product = await fetchProductById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    const [[linkedOrders]] = await db.query(
      "SELECT COUNT(*) AS total FROM order_items WHERE product_id = ?",
      [req.params.id]
    );

    if (Number(linkedOrders.total) > 0) {
      return res.status(400).json({
        message: "Ce produit est deja utilise dans des commandes. Modifie-le au lieu de le supprimer."
      });
    }

    await db.query("DELETE FROM products WHERE id = ?", [req.params.id]);
    res.json({ message: "Produit supprime" });
  } catch (error) {
    res.status(500).json({ message: "Impossible de supprimer le produit", error: error.message });
  }
};

exports.createCategory = async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Le nom de la categorie est obligatoire" });
  }

  try {
    const [existingRows] = await db.query("SELECT id FROM categories WHERE LOWER(name) = LOWER(?)", [name]);

    if (existingRows.length) {
      return res.status(409).json({ message: "Cette categorie existe deja" });
    }

    const [result] = await db.query("INSERT INTO categories (name) VALUES (?)", [name]);
    const [rows] = await db.query("SELECT * FROM categories WHERE id = ?", [result.insertId]);

    res.status(201).json({ message: "Categorie ajoutee", category: rows[0] });
  } catch (error) {
    res.status(500).json({ message: "Impossible d'ajouter la categorie", error: error.message });
  }
};
