const db = require("../config/db");

exports.getCatalog = async (req, res) => {
  try {
    const [products] = await db.query(`
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
      ORDER BY c.name, p.name
    `);

    const [categories] = await db.query("SELECT * FROM categories ORDER BY name");
    const [locations] = await db.query("SELECT * FROM locations ORDER BY name");
    const [bankAccounts] = await db.query("SELECT * FROM bank_accounts ORDER BY bank_name");

    res.json({
      products,
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

  if (!name || !price || !category_id) {
    return res.status(400).json({ message: "Nom, prix et categorie sont obligatoires" });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO products (name, description, price, stock, category_id, image)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, description || null, price, stock || 0, category_id, image || null]
    );

    const [rows] = await db.query("SELECT * FROM products WHERE id = ?", [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Impossible d'ajouter le produit", error: error.message });
  }
};
