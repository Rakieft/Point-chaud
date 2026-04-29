const db = require("../config/db");

exports.getDashboardStats = async (req, res) => {
  try {
    const [[orderStats]] = await db.query(`
      SELECT
        COUNT(*) AS total_orders,
        SUM(CASE WHEN status = 'pending_validation' THEN 1 ELSE 0 END) AS pending_validation,
        SUM(CASE WHEN status = 'awaiting_payment' THEN 1 ELSE 0 END) AS awaiting_payment,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
      FROM orders
    `);

    const [[userStats]] = await db.query(`
      SELECT
        COUNT(*) AS total_users,
        SUM(CASE WHEN role = 'client' THEN 1 ELSE 0 END) AS total_clients,
        SUM(CASE WHEN role = 'manager' THEN 1 ELSE 0 END) AS total_managers,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS total_admins
      FROM users
    `);

    const [[productStats]] = await db.query(`
      SELECT
        COUNT(*) AS total_products,
        COALESCE(SUM(stock), 0) AS total_stock
      FROM products
    `);

    res.json({
      orders: orderStats,
      users: userStats,
      products: productStats
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer les statistiques", error: error.message });
  }
};
