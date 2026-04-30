const db = require("../config/db");
const { hashPassword } = require("../utils/hash");
const { getScopedUser } = require("../utils/helpers");

async function ensureManagerLocationCoverage(locationId, excludedUserId = null) {
  const params = [locationId];
  let sql =
    "SELECT COUNT(*) AS total FROM users WHERE role = 'manager' AND is_active = TRUE AND assigned_location_id = ?";

  if (excludedUserId) {
    sql += " AND id <> ?";
    params.push(excludedUserId);
  }

  const [[row]] = await db.query(sql, params);
  return Number(row.total);
}

exports.getDashboardStats = async (req, res) => {
  try {
    const actor = await getScopedUser(req.user.id);
    const lowStockThreshold = 5;
    const filters = [];
    const params = [];

    if (actor.role === "manager") {
      filters.push("o.location_id = ?");
      params.push(actor.assigned_location_id);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const [[orderStats]] = await db.query(`
      SELECT
        COUNT(*) AS total_orders,
        SUM(CASE WHEN o.status = 'pending_validation' THEN 1 ELSE 0 END) AS pending_validation,
        SUM(CASE WHEN o.status = 'awaiting_payment' THEN 1 ELSE 0 END) AS awaiting_payment,
        SUM(CASE WHEN o.status = 'paid' THEN 1 ELSE 0 END) AS paid,
        SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completed,
        COALESCE(
          SUM(
            CASE
              WHEN o.status IN ('paid', 'completed') THEN COALESCE(items.items_total, 0) + COALESCE(o.delivery_fee, 0)
              ELSE 0
            END
          ),
          0
        ) AS revenue
      FROM orders o
      LEFT JOIN (
        SELECT order_id, SUM(quantity * price) AS items_total
        FROM order_items
        GROUP BY order_id
      ) items ON items.order_id = o.id
      ${whereClause}
    `, params);

    const [[userStats]] = await db.query(`
      SELECT
        COUNT(*) AS total_users,
        SUM(CASE WHEN role = 'client' THEN 1 ELSE 0 END) AS total_clients,
        SUM(CASE WHEN role = 'manager' AND is_active = TRUE THEN 1 ELSE 0 END) AS total_managers,
        SUM(CASE WHEN role = 'admin' AND is_active = TRUE THEN 1 ELSE 0 END) AS total_admins
      FROM users
    `);

    const [[productStats]] =
      actor.role === "manager"
        ? await db.query(
            `
              SELECT
                COUNT(DISTINCT p.id) AS total_products,
                COALESCE(SUM(ps.stock), 0) AS total_stock
              FROM products p
              LEFT JOIN product_stocks ps ON ps.product_id = p.id AND ps.location_id = ?
            `,
            [actor.assigned_location_id]
          )
        : await db.query(`
            SELECT
              COUNT(*) AS total_products,
              COALESCE(SUM(stock), 0) AS total_stock
            FROM products
          `);

    const [lowStockItems] = await db.query(
      `
        SELECT
          p.id AS product_id,
          p.name AS product_name,
          l.id AS location_id,
          l.name AS location_name,
          ps.stock
        FROM product_stocks ps
        INNER JOIN products p ON p.id = ps.product_id
        INNER JOIN locations l ON l.id = ps.location_id
        WHERE ps.stock <= ?
        ${actor.role === "manager" ? "AND ps.location_id = ?" : ""}
        ORDER BY ps.stock ASC, l.name, p.name
        LIMIT 10
      `,
      actor.role === "manager"
        ? [lowStockThreshold, actor.assigned_location_id]
        : [lowStockThreshold]
    );

    res.json({
      actor,
      orders: orderStats,
      users: userStats,
      products: productStats,
      lowStockThreshold,
      lowStockItems
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer les statistiques", error: error.message });
  }
};

exports.getMyProfile = async (req, res) => {
  try {
    const user = await getScopedUser(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer le profil", error: error.message });
  }
};

exports.updateMyProfile = async (req, res) => {
  const { name, email, phone, bio, avatar_url, title, password } = req.body;

  try {
    const currentUser = await getScopedUser(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    if (email) {
      const [existingUsers] = await db.query("SELECT id FROM users WHERE email = ? AND id <> ?", [email, req.user.id]);
      if (existingUsers.length) {
        return res.status(409).json({ message: "Cet email est deja utilise" });
      }
    }

    const updates = [
      name || currentUser.name || null,
      email || currentUser.email || null,
      phone ?? currentUser.phone ?? null,
      bio ?? currentUser.bio ?? null,
      avatar_url ?? currentUser.avatar_url ?? null,
      title ?? currentUser.title ?? null
    ];
    let sql = `
      UPDATE users
      SET name = ?, email = ?, phone = ?, bio = ?, avatar_url = ?, title = ?
    `;

    if (password) {
      const hashedPassword = await hashPassword(password);
      sql += ", password = ?";
      updates.push(hashedPassword);
    }

    sql += " WHERE id = ?";
    updates.push(req.user.id);

    await db.query(sql, updates);
    const updatedUser = await getScopedUser(req.user.id);
    res.json({ message: "Profil mis a jour", user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: "Impossible de mettre a jour le profil", error: error.message });
  }
};

exports.getStaff = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.bio,
        u.avatar_url,
        u.title,
        u.role,
        u.assigned_location_id,
        u.is_active,
        u.created_at,
        l.name AS assigned_location_name
      FROM users u
      LEFT JOIN locations l ON l.id = u.assigned_location_id
      WHERE u.role IN ('admin', 'manager', 'driver')
      ORDER BY u.role DESC, u.name
    `);

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer les membres du staff", error: error.message });
  }
};

exports.updateStaffMember = async (req, res) => {
  const { name, phone, bio, avatar_url, title, role, assigned_location_id, is_active } = req.body;

  try {
    const target = await getScopedUser(req.params.id);

    if (!target || !["admin", "manager", "driver"].includes(target.role)) {
      return res.status(404).json({ message: "Membre du staff introuvable" });
    }

    const nextRole = role || target.role;
    const nextLocationId =
      ["manager", "driver"].includes(nextRole) ? assigned_location_id || target.assigned_location_id : null;
    const nextIsActive = typeof is_active === "boolean" ? is_active : !!target.is_active;

    if (["manager", "driver"].includes(nextRole) && !nextLocationId) {
      return res.status(400).json({ message: "Ce membre du staff doit etre assigne a un point de vente" });
    }

    if (target.role === "manager" && (nextRole !== "manager" || !nextIsActive)) {
      const remainingManagers = await ensureManagerLocationCoverage(target.assigned_location_id, target.id);
      if (remainingManagers < 1) {
        return res.status(400).json({
          message: "Impossible: chaque succursale doit conserver au moins un manager actif"
        });
      }
    }

    await db.query(
      `
        UPDATE users
        SET
          name = ?,
          phone = ?,
          bio = ?,
          avatar_url = ?,
          title = ?,
          role = ?,
          assigned_location_id = ?,
          is_active = ?
        WHERE id = ?
      `,
      [
        name || target.name,
        phone ?? target.phone,
        bio ?? target.bio,
        avatar_url ?? target.avatar_url,
        title ?? target.title,
        nextRole,
        nextLocationId,
        nextIsActive,
        req.params.id
      ]
    );

    const updatedStaff = await getScopedUser(req.params.id);
    res.json({ message: "Membre du staff mis a jour", user: updatedStaff });
  } catch (error) {
    res.status(500).json({ message: "Impossible de modifier ce membre du staff", error: error.message });
  }
};

exports.deactivateStaffMember = async (req, res) => {
  try {
    const target = await getScopedUser(req.params.id);

    if (!target || !["admin", "manager", "driver"].includes(target.role)) {
      return res.status(404).json({ message: "Membre du staff introuvable" });
    }

    if (Number(target.id) === Number(req.user.id)) {
      return res.status(400).json({ message: "Vous ne pouvez pas vous desactiver vous-meme" });
    }

    if (target.role === "manager") {
      const remainingManagers = await ensureManagerLocationCoverage(target.assigned_location_id, target.id);
      if (remainingManagers < 1) {
        return res.status(400).json({
          message: "Impossible: chaque succursale doit conserver au moins un manager actif"
        });
      }
    }

    await db.query("UPDATE users SET is_active = FALSE WHERE id = ?", [req.params.id]);
    res.json({ message: "Membre du staff desactive" });
  } catch (error) {
    res.status(500).json({ message: "Impossible de desactiver ce compte", error: error.message });
  }
};

exports.getReports = async (req, res) => {
  try {
    const actor = await getScopedUser(req.user.id);
    const params = [];
    let locationFilter = "";

    if (actor.role === "manager") {
      locationFilter = "AND o.location_id = ?";
      params.push(actor.assigned_location_id);
    }

    const [rows] = await db.query(
      `
        SELECT
          l.id AS location_id,
          l.name AS location_name,
          p.id AS product_id,
          p.name AS product_name,
          COALESCE(ps.stock, 0) AS stock,
          COALESCE(SUM(oi.quantity), 0) AS quantity_sold,
          COALESCE(SUM(oi.quantity * oi.price), 0) AS revenue
        FROM locations l
        CROSS JOIN products p
        LEFT JOIN product_stocks ps ON ps.product_id = p.id AND ps.location_id = l.id
        LEFT JOIN order_items oi ON oi.product_id = p.id
        LEFT JOIN orders o ON o.id = oi.order_id
          AND o.status IN ('awaiting_payment', 'paid', 'completed')
          AND o.location_id = l.id
        WHERE 1=1 ${locationFilter}
        GROUP BY l.id, l.name, p.id, p.name, ps.stock
        ORDER BY l.name, quantity_sold DESC, p.name
      `,
      params
    );

    const grouped = rows.reduce((accumulator, row) => {
      if (!accumulator[row.location_id]) {
        accumulator[row.location_id] = {
          location_id: row.location_id,
          location_name: row.location_name,
          best_sellers: [],
          low_sellers: [],
          products: []
        };
      }

      accumulator[row.location_id].products.push(row);
      return accumulator;
    }, {});

    const reports = Object.values(grouped).map(report => {
      const sorted = [...report.products].sort((a, b) => Number(b.quantity_sold) - Number(a.quantity_sold));
      return {
        ...report,
        best_sellers: sorted.slice(0, 5),
        low_sellers: [...sorted].reverse().slice(0, 5),
        low_stock: report.products
          .filter(product => Number(product.stock || 0) <= 5)
          .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0))
          .slice(0, 5)
      };
    });

    res.json({ actor, reports });
  } catch (error) {
    res.status(500).json({ message: "Impossible de generer les rapports", error: error.message });
  }
};

exports.getDrivers = async (req, res) => {
  try {
    const actor = await getScopedUser(req.user.id);
    const params = [];
    let whereClause = "WHERE u.role = 'driver' AND u.is_active = TRUE";

    if (actor.role === "manager") {
      whereClause += " AND u.assigned_location_id = ?";
      params.push(actor.assigned_location_id);
    }

    const [rows] = await db.query(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          u.phone,
          u.assigned_location_id,
          l.name AS assigned_location_name
        FROM users u
        LEFT JOIN locations l ON l.id = u.assigned_location_id
        ${whereClause}
        ORDER BY u.name
      `,
      params
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer les livreurs", error: error.message });
  }
};

exports.getAnalyticsOverview = async (req, res) => {
  try {
    const rollingDays = 30;
    const [locations] = await db.query("SELECT id, name, address FROM locations ORDER BY id");

    const [revenueRows] = await db.query(
      `
        SELECT
          l.id AS location_id,
          l.name AS location_name,
          COALESCE(
            SUM(
              CASE
                WHEN o.status IN ('paid', 'completed') THEN COALESCE(items.items_total, 0) + COALESCE(o.delivery_fee, 0)
                ELSE 0
              END
            ),
            0
          ) AS revenue,
          COUNT(DISTINCT CASE WHEN o.status IN ('paid', 'completed') THEN o.id END) AS confirmed_orders
        FROM locations l
        LEFT JOIN orders o
          ON o.location_id = l.id
          AND o.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        LEFT JOIN (
          SELECT order_id, SUM(quantity * price) AS items_total
          FROM order_items
          GROUP BY order_id
        ) items ON items.order_id = o.id
        GROUP BY l.id, l.name
        ORDER BY l.id
      `,
      [rollingDays]
    );

    const [[usersRow]] = await db.query(
      `
        SELECT
          COUNT(*) AS total_users,
          SUM(CASE WHEN role = 'client' THEN 1 ELSE 0 END) AS total_clients,
          SUM(CASE WHEN role IN ('admin', 'manager', 'driver') THEN 1 ELSE 0 END) AS total_staff,
          SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 1 ELSE 0 END) AS new_users_last_30_days
        FROM users
      `,
      [rollingDays]
    );

    const [[ordersRow]] = await db.query(
      `
        SELECT
          COUNT(*) AS total_orders_last_30_days,
          SUM(CASE WHEN status = 'pending_validation' THEN 1 ELSE 0 END) AS pending_orders_last_30_days,
          SUM(CASE WHEN status IN ('paid', 'completed') THEN 1 ELSE 0 END) AS confirmed_orders_last_30_days
        FROM orders
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      `,
      [rollingDays]
    );

    const totalRevenue = revenueRows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    const byLocation = locations.map(location => {
      const current = revenueRows.find(row => Number(row.location_id) === Number(location.id)) || {
        revenue: 0,
        confirmed_orders: 0
      };

      return {
        location_id: Number(location.id),
        location_name: location.name,
        revenue: Number(current.revenue || 0),
        confirmed_orders: Number(current.confirmed_orders || 0),
        percentage: totalRevenue ? (Number(current.revenue || 0) / totalRevenue) * 100 : 0
      };
    });

    const topLocation =
      [...byLocation].sort((a, b) => Number(b.revenue) - Number(a.revenue))[0] || null;

    const averageBasket =
      Number(ordersRow.confirmed_orders_last_30_days || 0) > 0
        ? totalRevenue / Number(ordersRow.confirmed_orders_last_30_days)
        : 0;

    res.json({
      rolling_days: rollingDays,
      generated_at: new Date().toISOString(),
      revenue: {
        total: totalRevenue,
        by_location: byLocation,
        top_location: topLocation,
        average_basket: averageBasket
      },
      users: {
        total_users: Number(usersRow.total_users || 0),
        total_clients: Number(usersRow.total_clients || 0),
        total_staff: Number(usersRow.total_staff || 0),
        new_users_last_30_days: Number(usersRow.new_users_last_30_days || 0)
      },
      orders: {
        total_orders_last_30_days: Number(ordersRow.total_orders_last_30_days || 0),
        pending_orders_last_30_days: Number(ordersRow.pending_orders_last_30_days || 0),
        confirmed_orders_last_30_days: Number(ordersRow.confirmed_orders_last_30_days || 0)
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer les analyses", error: error.message });
  }
};
