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

async function categoryExists(categoryId) {
  const [rows] = await db.query("SELECT id FROM categories WHERE id = ? LIMIT 1", [categoryId]);
  return rows.length > 0;
}

const DAILY_SPECIAL_WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
];

async function fetchPromotions(kind) {
  const [rows] = await db.query(
    `
      SELECT
        promo.id,
        promo.title,
        promo.price_label,
        promo.description,
        promo.image,
        promo.product_id,
        promo.period_label,
        promo.kind,
        promo.start_date,
        promo.end_date,
        promo.is_active,
        promo.sort_order,
        p.name AS product_name,
        p.price AS product_price,
        p.image AS product_image,
        c.name AS category_name
      FROM promotions promo
      LEFT JOIN products p ON p.id = promo.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE promo.kind = ?
      ORDER BY promo.is_active DESC, promo.sort_order ASC, promo.id ASC
    `,
    [kind]
  );

  return rows.map(row => ({
    ...row,
    product_id: row.product_id ? Number(row.product_id) : null,
    is_active: Boolean(row.is_active),
    product: row.product_id
      ? {
          id: Number(row.product_id),
          name: row.product_name,
          price: Number(row.product_price || 0),
          image: row.product_image || "",
          category_name: row.category_name || ""
        }
      : null
  }));
}

async function fetchDailySpecials() {
  const [rows] = await db.query(
    `
      SELECT
        ds.id,
        ds.weekday,
        ds.product_id,
        ds.is_active,
        p.name AS product_name,
        p.price AS product_price,
        p.image AS product_image,
        c.name AS category_name
      FROM daily_specials ds
      LEFT JOIN products p ON p.id = ds.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY FIELD(ds.weekday, 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
    `
  );

  return rows.map(row => ({
    ...row,
    is_active: Boolean(row.is_active),
    product: row.product_id
      ? {
          id: Number(row.product_id),
          name: row.product_name,
          price: Number(row.product_price || 0),
          image: row.product_image || "",
          category_name: row.category_name || ""
        }
      : null
  }));
}

async function buildMarketingPayload() {
  const [currentPromotions, upcomingPromotions, dailySpecials] = await Promise.all([
    fetchPromotions("current"),
    fetchPromotions("upcoming"),
    fetchDailySpecials()
  ]);

  const currentEvent = currentPromotions.find(item => item.is_active) || currentPromotions[0] || null;

  return {
    currentEvent,
    upcomingEvents: upcomingPromotions,
    dailySpecials
  };
}

exports.uploadAdminImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Aucune image n'a ete envoyee" });
    }

    const scope = ["products", "promotions"].includes(String(req.query.scope || "").toLowerCase())
      ? String(req.query.scope).toLowerCase()
      : "general";

    res.status(201).json({
      message: "Image telechargee avec succes",
      imagePath: `/uploads/${scope}/${req.file.filename}`,
      filename: req.file.filename
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de telecharger l'image", error: error.message });
  }
};

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

exports.getMarketingContent = async (req, res) => {
  try {
    const data = await buildMarketingPayload();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer les contenus marketing", error: error.message });
  }
};

exports.getMarketingAdmin = async (req, res) => {
  try {
    const marketing = await buildMarketingPayload();
    const [products] = await db.query(
      `
        SELECT
          p.id,
          p.name,
          p.price,
          p.image,
          c.name AS category_name
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        ORDER BY c.name, p.name
      `
    );

    res.json({
      ...marketing,
      products: products.map(product => ({
        ...product,
        price: Number(product.price || 0)
      }))
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer la gestion marketing", error: error.message });
  }
};

exports.saveCurrentPromotion = async (req, res) => {
  const {
    id,
    title,
    price_label,
    description,
    image,
    product_id,
    period_label,
    start_date,
    end_date,
    is_active
  } = req.body;

  if (!title) {
    return res.status(400).json({ message: "Le titre de l'evenement est obligatoire" });
  }

  try {
    const payload = [
      title,
      price_label || null,
      description || null,
      image || null,
      product_id ? Number(product_id) : null,
      period_label || null,
      start_date || null,
      end_date || null,
      is_active === false || is_active === "false" ? 0 : 1
    ];

    if (id) {
      await db.query(
        `
          UPDATE promotions
          SET title = ?, price_label = ?, description = ?, image = ?, product_id = ?, period_label = ?, start_date = ?, end_date = ?, is_active = ?
          WHERE id = ? AND kind = 'current'
        `,
        [...payload, id]
      );
    } else {
      const [existingRows] = await db.query("SELECT id FROM promotions WHERE kind = 'current' ORDER BY id ASC LIMIT 1");
      if (existingRows.length) {
        await db.query(
        `
          UPDATE promotions
          SET title = ?, price_label = ?, description = ?, image = ?, product_id = ?, period_label = ?, start_date = ?, end_date = ?, is_active = ?
          WHERE id = ?
        `,
        [...payload, existingRows[0].id]
        );
      } else {
        await db.query(
        `
            INSERT INTO promotions (title, price_label, description, image, product_id, period_label, start_date, end_date, is_active, kind, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', 1)
          `,
          payload
        );
      }
    }

    const data = await buildMarketingPayload();
    res.json({ message: "Evenement du moment mis a jour", ...data });
  } catch (error) {
    res.status(500).json({ message: "Impossible de mettre a jour l'evenement du moment", error: error.message });
  }
};

exports.createUpcomingPromotion = async (req, res) => {
  const { title, price_label, description, image, product_id, period_label, start_date, end_date, is_active, sort_order } = req.body;

  if (!title) {
    return res.status(400).json({ message: "Le titre de l'evenement est obligatoire" });
  }

  try {
    await db.query(
      `
        INSERT INTO promotions (title, price_label, description, image, product_id, period_label, start_date, end_date, is_active, kind, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?)
      `,
      [
        title,
        price_label || null,
        description || null,
        image || null,
        product_id ? Number(product_id) : null,
        period_label || null,
        start_date || null,
        end_date || null,
        is_active === false || is_active === "false" ? 0 : 1,
        Number(sort_order || 0)
      ]
    );

    const data = await buildMarketingPayload();
    res.status(201).json({ message: "Evenement a venir ajoute", ...data });
  } catch (error) {
    res.status(500).json({ message: "Impossible d'ajouter l'evenement", error: error.message });
  }
};

exports.updateUpcomingPromotion = async (req, res) => {
  const { title, price_label, description, image, product_id, period_label, start_date, end_date, is_active, sort_order } = req.body;

  if (!title) {
    return res.status(400).json({ message: "Le titre de l'evenement est obligatoire" });
  }

  try {
    await db.query(
      `
        UPDATE promotions
        SET title = ?, price_label = ?, description = ?, image = ?, product_id = ?, period_label = ?, start_date = ?, end_date = ?, is_active = ?, sort_order = ?
        WHERE id = ? AND kind = 'upcoming'
      `,
      [
        title,
        price_label || null,
        description || null,
        image || null,
        product_id ? Number(product_id) : null,
        period_label || null,
        start_date || null,
        end_date || null,
        is_active === false || is_active === "false" ? 0 : 1,
        Number(sort_order || 0),
        req.params.id
      ]
    );

    const data = await buildMarketingPayload();
    res.json({ message: "Evenement a venir mis a jour", ...data });
  } catch (error) {
    res.status(500).json({ message: "Impossible de modifier l'evenement", error: error.message });
  }
};

exports.deleteUpcomingPromotion = async (req, res) => {
  try {
    await db.query("DELETE FROM promotions WHERE id = ? AND kind = 'upcoming'", [req.params.id]);
    const data = await buildMarketingPayload();
    res.json({ message: "Evenement supprime", ...data });
  } catch (error) {
    res.status(500).json({ message: "Impossible de supprimer l'evenement", error: error.message });
  }
};

exports.saveDailySpecials = async (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

  try {
    for (const weekday of DAILY_SPECIAL_WEEKDAYS) {
      const row = entries.find(item => String(item.weekday) === weekday) || {};
      const productId = row.product_id ? Number(row.product_id) : null;
      const isActive = row.is_active === false || row.is_active === "false" ? 0 : 1;

      const [existingRows] = await db.query("SELECT id FROM daily_specials WHERE weekday = ? LIMIT 1", [weekday]);
      if (existingRows.length) {
        await db.query(
          "UPDATE daily_specials SET product_id = ?, is_active = ? WHERE id = ?",
          [productId, isActive, existingRows[0].id]
        );
      } else {
        await db.query(
          "INSERT INTO daily_specials (weekday, product_id, is_active) VALUES (?, ?, ?)",
          [weekday, productId, isActive]
        );
      }
    }

    const data = await buildMarketingPayload();
    res.json({ message: "Plats du jour mis a jour", ...data });
  } catch (error) {
    res.status(500).json({ message: "Impossible de mettre a jour les plats du jour", error: error.message });
  }
};

exports.createProduct = async (req, res) => {
  const { name, description, price, stock, category_id, image } = req.body;
  const location_stocks = parseLocationStocks(req.body.location_stocks);
  const normalizedCategoryId = Number(category_id);

  if (!name || !price || !normalizedCategoryId) {
    return res.status(400).json({ message: "Nom, prix et categorie sont obligatoires" });
  }

  try {
    if (!(await categoryExists(normalizedCategoryId))) {
      return res.status(400).json({ message: "Categorie invalide ou introuvable" });
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `INSERT INTO products (name, description, price, stock, category_id, image)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, description || null, price, stock || 0, normalizedCategoryId, image || null]
      );

      const locations = await getLocations(connection);
      const normalizedStocks = normalizeLocationStocks(location_stocks, locations, Number(stock || 0));
      await setProductLocationStocks(connection, result.insertId, normalizedStocks);

      await connection.commit();
      const product = await fetchProductById(result.insertId);
      res.status(201).json({ message: "Produit ajoute avec succes", product });
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
  const normalizedCategoryId = Number(category_id);

  if (!name || !price || !normalizedCategoryId) {
    return res.status(400).json({ message: "Nom, prix et categorie sont obligatoires" });
  }

  try {
    const product = await fetchProductById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    if (!(await categoryExists(normalizedCategoryId))) {
      return res.status(400).json({ message: "Categorie invalide ou introuvable" });
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
        [name, description || null, price, normalizedCategoryId, image || null, req.params.id]
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

exports.updateCategory = async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Le nom de la categorie est obligatoire" });
  }

  try {
    const [currentRows] = await db.query("SELECT * FROM categories WHERE id = ? LIMIT 1", [req.params.id]);

    if (!currentRows.length) {
      return res.status(404).json({ message: "Categorie introuvable" });
    }

    const [existingRows] = await db.query("SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id <> ?", [
      name,
      req.params.id
    ]);

    if (existingRows.length) {
      return res.status(409).json({ message: "Cette categorie existe deja" });
    }

    await db.query("UPDATE categories SET name = ? WHERE id = ?", [name, req.params.id]);
    const [rows] = await db.query("SELECT * FROM categories WHERE id = ?", [req.params.id]);

    res.json({ message: "Categorie mise a jour", category: rows[0] });
  } catch (error) {
    res.status(500).json({ message: "Impossible de modifier la categorie", error: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const [currentRows] = await db.query("SELECT * FROM categories WHERE id = ? LIMIT 1", [req.params.id]);

    if (!currentRows.length) {
      return res.status(404).json({ message: "Categorie introuvable" });
    }

    const [[linkedProducts]] = await db.query("SELECT COUNT(*) AS total FROM products WHERE category_id = ?", [
      req.params.id
    ]);

    if (Number(linkedProducts.total) > 0) {
      return res.status(400).json({
        message: "Cette categorie contient deja des produits. Deplace ou supprime les produits avant."
      });
    }

    await db.query("DELETE FROM categories WHERE id = ?", [req.params.id]);
    res.json({ message: "Categorie supprimee" });
  } catch (error) {
    res.status(500).json({ message: "Impossible de supprimer la categorie", error: error.message });
  }
};
