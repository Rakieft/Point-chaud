const db = require("../config/db");
const { hashPassword } = require("../utils/hash");
const { getScopedUser, getClientCreditBalance, getClientCreditPayments } = require("../utils/helpers");
const {
  getPaymentProofCleanupStats,
  runPaymentProofCleanup
} = require("../services/payment-proof-cleanup.service");

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

exports.getClientCreditProfiles = async (req, res) => {
  try {
    const searchTerm = String(req.query.search || "").trim();
    const enabledOnly = String(req.query.enabled_only || "true") !== "false";
    const params = [];
    const clauses = ["role = 'client'"];

    if (enabledOnly) {
      clauses.push("credit_enabled = TRUE");
    }

    if (searchTerm) {
      clauses.push("(name LIKE ? OR email LIKE ? OR phone LIKE ?)");
      const likeValue = `%${searchTerm}%`;
      params.push(likeValue, likeValue, likeValue);
    }

    const [rows] = await db.query(
      `
        SELECT
          id,
          name,
          email,
          phone,
          credit_enabled,
          credit_limit,
          credit_status,
          credit_note,
          created_at
        FROM users
        WHERE ${clauses.join(" AND ")}
        ORDER BY name, email
      `,
      params
    );

    const clients = await Promise.all(rows.map(row => getScopedUser(row.id)));
    res.json(clients.filter(Boolean));
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer les clients a credit", error: error.message });
  }
};

exports.updateClientCreditSettings = async (req, res) => {
  const { credit_enabled, credit_limit, credit_status, credit_note } = req.body;

  try {
    const target = await getScopedUser(req.params.id);

    if (!target || target.role !== "client") {
      return res.status(404).json({ message: "Client introuvable" });
    }

    const nextCreditEnabled =
      typeof credit_enabled === "boolean" ? credit_enabled : String(credit_enabled) === "true";
    const nextCreditLimit = Math.max(0, Number(credit_limit || 0));
    const nextCreditStatus = ["inactive", "active", "suspended"].includes(String(credit_status || ""))
      ? String(credit_status)
      : nextCreditEnabled
        ? "active"
        : "inactive";

    await db.query(
      `
        UPDATE users
        SET
          credit_enabled = ?,
          credit_limit = ?,
          credit_status = ?,
          credit_note = ?
        WHERE id = ?
      `,
      [nextCreditEnabled, nextCreditLimit, nextCreditStatus, credit_note ?? target.credit_note ?? null, req.params.id]
    );

    const updatedClient = await getScopedUser(req.params.id);
    res.json({ message: "Acces credit mis a jour", user: updatedClient });
  } catch (error) {
    res.status(500).json({ message: "Impossible de mettre a jour le credit client", error: error.message });
  }
};

exports.getClientCreditPaymentHistory = async (req, res) => {
  try {
    const target = await getScopedUser(req.params.id);

    if (!target || target.role !== "client") {
      return res.status(404).json({ message: "Client introuvable" });
    }

    const payments = await getClientCreditPayments(target.id, Number(req.query.limit || 20));
    res.json({
      client: target,
      payments
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer l'historique du credit", error: error.message });
  }
};

exports.recordClientCreditPayment = async (req, res) => {
  const { amount, note, paid_at, payment_channel } = req.body;
  const normalizedAmount = Number(amount || 0);
  const normalizedChannel = String(payment_channel || "").trim() || null;
  const allowedChannels = ["cash", "moncash", "bank_transfer", "natcash", "other"];

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return res.status(400).json({ message: "Le montant du reglement est invalide" });
  }

  if (normalizedChannel && !allowedChannels.includes(normalizedChannel)) {
    return res.status(400).json({ message: "Canal de paiement credit invalide" });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const target = await getScopedUser(req.params.id);

    if (!target || target.role !== "client") {
      await connection.rollback();
      return res.status(404).json({ message: "Client introuvable" });
    }

    const currentBalance = await getClientCreditBalance(target.id, connection);

    if (currentBalance <= 0) {
      await connection.rollback();
      return res.status(400).json({ message: "Ce client n'a aucun solde credit ouvert" });
    }

    if (normalizedAmount > currentBalance) {
      await connection.rollback();
      return res.status(400).json({
        message: `Le montant depasse le solde ouvert actuel (${currentBalance.toFixed(2)} HTG)`
      });
    }

    const [openOrders] = await connection.query(
      `
        SELECT
          id,
          COALESCE(credit_amount, 0) AS credit_amount,
          COALESCE(credit_settled_amount, 0) AS credit_settled_amount,
          created_at
        FROM orders
        WHERE user_id = ?
          AND payment_method = 'credit'
          AND credit_settlement_status IN ('open', 'partial')
        ORDER BY created_at ASC, id ASC
      `,
      [target.id]
    );

    if (!openOrders.length) {
      await connection.rollback();
      return res.status(400).json({ message: "Aucune commande credit ouverte n'a ete trouvee pour ce client" });
    }

    let remainingAmount = normalizedAmount;

    for (const order of openOrders) {
      if (remainingAmount <= 0) break;

      const openAmount = Math.max(0, Number(order.credit_amount || 0) - Number(order.credit_settled_amount || 0));
      if (openAmount <= 0) continue;

      const appliedAmount = Math.min(openAmount, remainingAmount);
      const nextSettledAmount = Number(order.credit_settled_amount || 0) + appliedAmount;
      const nextStatus =
        nextSettledAmount >= Number(order.credit_amount || 0) - 0.0001 ? "settled" : "partial";

      await connection.query(
        `
          UPDATE orders
          SET
            credit_settled_amount = ?,
            credit_settlement_status = ?
          WHERE id = ?
        `,
        [nextSettledAmount, nextStatus, order.id]
      );

      remainingAmount -= appliedAmount;
    }

    if (remainingAmount > 0.009) {
      await connection.rollback();
      return res.status(400).json({
        message: "Le reglement n'a pas pu etre applique entierement aux commandes ouvertes"
      });
    }

    await connection.query(
      `
        INSERT INTO credit_payments (
          user_id,
          amount,
          payment_channel,
          note,
          recorded_by,
          paid_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        target.id,
        normalizedAmount,
        normalizedChannel,
        note ? String(note).trim() : null,
        req.user.id,
        paid_at ? String(paid_at) : new Date()
      ]
    );

    await connection.commit();

    const updatedClient = await getScopedUser(target.id);
    const payments = await getClientCreditPayments(target.id, 20);

    res.json({
      message: "Reglement credit enregistre",
      client: updatedClient,
      payments
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: "Impossible d'enregistrer ce reglement credit", error: error.message });
  } finally {
    connection.release();
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
        const soldProducts = report.products
          .filter(product => Number(product.quantity_sold || 0) > 0)
          .sort((a, b) => Number(b.quantity_sold) - Number(a.quantity_sold));
        const lowSellingProducts = [...soldProducts].sort((a, b) => Number(a.quantity_sold) - Number(b.quantity_sold));

        return {
          ...report,
          has_sales: soldProducts.length > 0,
          best_sellers: soldProducts.slice(0, 5),
          low_sellers: lowSellingProducts.slice(0, 5),
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

function getPreviousMonthSnapshot() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Port-au-Prince",
    year: "numeric",
    month: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(part => [part.type, part.value]));
  let year = Number(parts.year);
  let month = Number(parts.month) - 1;

  if (month < 1) {
    month = 12;
    year -= 1;
  }

  return { year, month };
}

function normalizeAuditPeriod(query) {
  const fallback = getPreviousMonthSnapshot();
  const year = Number(query?.year || fallback.year);
  const month = Number(query?.month || fallback.month);

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new Error("Annee de rapport invalide");
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Mois de rapport invalide");
  }

  const monthLabel = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, 15, 12, 0, 0)));

  return {
    year,
    month,
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    endDateExclusive:
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`,
    label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)
  };
}

function getRecentSaturdaySnapshot() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Port-au-Prince",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(part => [part.type, part.value]));
  const baseDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12, 0, 0));
  const currentDay = baseDate.getUTCDay();
  const diffToSaturday = (currentDay - 6 + 7) % 7;
  baseDate.setUTCDate(baseDate.getUTCDate() - diffToSaturday);
  return baseDate.toISOString().slice(0, 10);
}

function formatDateLabelFr(dateString) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${dateString}T12:00:00Z`));
}

function formatTimestamp(dateValue) {
  if (!dateValue) return "Date indisponible";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Date indisponible";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Port-au-Prince"
  }).format(date);
}

function normalizeDriverWeekPeriod(query) {
  const weekEnding = String(query?.week_ending || getRecentSaturdaySnapshot());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekEnding)) {
    throw new Error("Date de semaine invalide");
  }

  const endDate = new Date(`${weekEnding}T12:00:00Z`);
  if (Number.isNaN(endDate.getTime())) {
    throw new Error("Date de semaine invalide");
  }

  if (endDate.getUTCDay() !== 6) {
    throw new Error("Choisis la date du samedi a payer");
  }

  const startDate = new Date(endDate);
  startDate.setUTCDate(endDate.getUTCDate() - 5);
  const endDateExclusive = new Date(endDate);
  endDateExclusive.setUTCDate(endDate.getUTCDate() + 1);

  return {
    weekEnding,
    weekStart: startDate.toISOString().slice(0, 10),
    weekEndExclusive: endDateExclusive.toISOString().slice(0, 10),
    label: `Semaine du ${formatDateLabelFr(startDate.toISOString().slice(0, 10))} au ${formatDateLabelFr(weekEnding)}`
  };
}

function parseStoredPayload(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function buildAuditCsv(report) {
  const lines = [
    ["Section", "Libelle", "Valeur"],
    ["Periode", "Mois", report.period.label],
    ["Periode", "Debut", report.period.start_date],
    ["Periode", "Fin exclusive", report.period.end_date_exclusive],
    ["Resume", "Commandes totales", report.summary.total_orders],
    ["Resume", "Commandes confirmees", report.summary.confirmed_orders],
    ["Resume", "Commandes annulees", report.summary.cancelled_orders],
    ["Resume", "Paiements confirmes", report.summary.confirmed_payments],
    ["Resume", "Paiements rejetes", report.summary.rejected_payments],
    ["Resume", "Livraisons effectuees", report.summary.deliveries_completed],
    ["Resume", "Retours livraison", report.summary.deliveries_returned],
    ["Resume", "Revenu total HTG", Number(report.summary.total_revenue || 0).toFixed(2)],
    ["Resume", "Panier moyen HTG", Number(report.summary.average_basket || 0).toFixed(2)]
  ];

  report.locations.forEach(location => {
    lines.push(["Succursale", location.location_name, Number(location.revenue || 0).toFixed(2)]);
    lines.push(["Succursale", `${location.location_name} commandes confirmees`, location.confirmed_orders]);
    (location.products_sold || []).forEach(product => {
      lines.push([
        "Produit succursale",
        `${location.location_name} - ${product.product_name}`,
        `${product.quantity_sold} vente(s) / ${Number(product.revenue || 0).toFixed(2)} HTG / prix moyen ${Number(product.average_unit_price || 0).toFixed(2)} HTG / min ${Number(product.min_unit_price || 0).toFixed(2)} / max ${Number(product.max_unit_price || 0).toFixed(2)}`
      ]);
    });
  });

  report.top_products.forEach((product, index) => {
    lines.push(["Top produit", `#${index + 1} ${product.product_name}`, product.quantity_sold]);
  });

  report.promotions.forEach(promotion => {
    lines.push(["Promotion", promotion.title, promotion.kind === "current" ? "En cours" : "A venir"]);
  });

  return lines
    .map(columns =>
      columns
        .map(value => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
}

function escapePdfText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildAuditPdfLines(report) {
  const lines = [
    "Point Chaud - Rapport mensuel d'audit",
    `Periode: ${report.period.label}`,
    `Scope: ${report.generated_for}`,
    "",
    "Resume",
    `- Commandes totales: ${report.summary.total_orders}`,
    `- Commandes confirmees: ${report.summary.confirmed_orders}`,
    `- Commandes annulees: ${report.summary.cancelled_orders}`,
    `- Paiements confirmes: ${report.summary.confirmed_payments}`,
    `- Paiements rejetes: ${report.summary.rejected_payments}`,
    `- Livraisons effectuees: ${report.summary.deliveries_completed}`,
    `- Retours livraison: ${report.summary.deliveries_returned}`,
    `- Revenu total: ${Number(report.summary.total_revenue || 0).toFixed(2)} HTG`,
    `- Panier moyen: ${Number(report.summary.average_basket || 0).toFixed(2)} HTG`,
    "",
    "Ventes par succursale"
  ];

  if (report.locations.length) {
    report.locations.forEach(location => {
      lines.push(
        `- ${location.location_name}: ${Number(location.revenue || 0).toFixed(2)} HTG / ${location.confirmed_orders} commande(s) confirmee(s)`
      );
      if (Array.isArray(location.products_sold) && location.products_sold.length) {
        location.products_sold.slice(0, 5).forEach(product => {
          const hasPriceVariation =
            Number(product.min_unit_price || 0) !== Number(product.max_unit_price || 0);
          lines.push(
            `  * ${product.product_name}: ${product.quantity_sold} vente(s) / ${Number(product.revenue || 0).toFixed(2)} HTG / prix moyen ${Number(product.average_unit_price || 0).toFixed(2)} HTG${
              hasPriceVariation
                ? ` (min ${Number(product.min_unit_price || 0).toFixed(2)} - max ${Number(product.max_unit_price || 0).toFixed(2)})`
                : ""
            }`
          );
        });
      } else {
        lines.push("  * Aucun produit vendu sur cette periode");
      }
    });
  } else {
    lines.push("- Aucune donnee disponible");
  }

  lines.push("", "Top produits du mois");

  if (report.top_products.length) {
    report.top_products.forEach((product, index) => {
      lines.push(
        `- #${index + 1} ${product.product_name}: ${product.quantity_sold} vente(s) / ${Number(product.revenue || 0).toFixed(2)} HTG`
      );
    });
  } else {
    lines.push("- Aucune vente confirmee sur cette periode");
  }

  lines.push("", "Promotions observees");

  if (report.promotions.length) {
    report.promotions.forEach(promotion => {
      lines.push(
        `- ${promotion.title} (${promotion.kind === "current" ? "En cours" : "A venir"})${promotion.price_label ? ` - ${promotion.price_label}` : ""}`
      );
    });
  } else {
    lines.push("- Aucune promotion active sur cette periode");
  }

  return lines;
}

function buildDriverWeeklyPdfLines(report) {
  const lines = [
    "Point Chaud - Rapport hebdomadaire livreurs",
    `Periode: ${report.period.label}`,
    `Scope: ${report.generated_for}`,
    "",
    "Resume",
    `- Livreurs concernes: ${report.summary.total_drivers}`,
    `- Livraisons effectuees: ${report.summary.delivered_orders}`,
    `- Retours succursale: ${report.summary.returned_orders}`,
    `- Commandes livraison traitees: ${report.summary.total_delivery_orders}`,
    `- Frais de livraison encaisses: ${Number(report.summary.total_delivery_fees || 0).toFixed(2)} HTG`,
    "",
    "Detail par livreur"
  ];

  report.drivers.forEach(driver => {
    lines.push(
      `- ${driver.driver_name} (${driver.assigned_location_name || "Sans succursale"}): ${driver.delivered_orders} livraison(s), ${driver.returned_orders} retour(s), ${Number(driver.delivery_fees_total || 0).toFixed(2)} HTG de frais`
    );

    if (Array.isArray(driver.orders) && driver.orders.length) {
      driver.orders.forEach(order => {
        lines.push(
          `  * Commande #${order.order_id} - ${order.customer_name || "Client"} - ${order.delivery_status === "delivered" ? "Livree" : "Retour"} - ${order.event_at_label} - ${Number(order.delivery_fee || 0).toFixed(2)} HTG`
        );
      });
    } else {
      lines.push("  * Aucune livraison sur cette periode");
    }
  });

  return lines;
}

function wrapPdfLine(line, maxLength = 88) {
  const normalized = String(line ?? "");
  if (normalized.length <= maxLength) return [normalized];

  const words = normalized.split(/\s+/);
  const result = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    const next = `${current} ${word}`;
    if (next.length <= maxLength) {
      current = next;
    } else {
      result.push(current);
      current = word;
    }
  }

  if (current) result.push(current);
  return result;
}

function buildSimplePdfBuffer(lines) {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginLeft = 48;
  const startY = 792;
  const leading = 16;
  const usableLinesPerPage = 44;
  const wrappedLines = lines.flatMap(line => wrapPdfLine(line));
  const pages = [];

  for (let index = 0; index < wrappedLines.length; index += usableLinesPerPage) {
    pages.push(wrappedLines.slice(index, index + usableLinesPerPage));
  }

  if (!pages.length) pages.push(["Rapport vide"]);

  const objects = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");

  const pageObjectNumbers = pages.map((_, index) => 4 + index * 2);
  const contentObjectNumbers = pages.map((_, index) => 5 + index * 2);
  objects.push(`<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectNumbers.map(number => `${number} 0 R`).join(" ")}] >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  pages.forEach((pageLines, index) => {
    const pageObjectNumber = pageObjectNumbers[index];
    const contentObjectNumber = contentObjectNumbers[index];
    const textRows = pageLines.map((line, lineIndex) => {
      if (lineIndex === 0) {
        return `${marginLeft} ${startY} Td (${escapePdfText(line)}) Tj`;
      }
      return `T* (${escapePdfText(line)}) Tj`;
    });
    const stream = `BT\n/F1 11 Tf\n${leading} TL\n${textRows.join("\n")}\nET`;
    objects[pageObjectNumber - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
    objects[contentObjectNumber - 1] = `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

async function computeMonthlyAuditReport(actor, period) {
  const scope = actor.role === "manager" ? "location" : "global";
  const locationId = actor.role === "manager" ? Number(actor.assigned_location_id) : null;
  const filters = ["o.created_at >= ?", "o.created_at < ?"];
  const params = [period.startDate, period.endDateExclusive];

  if (locationId) {
    filters.push("o.location_id = ?");
    params.push(locationId);
  }

  const whereClause = `WHERE ${filters.join(" AND ")}`;
  const [summaryRows] = await db.query(
    `
      SELECT
        COUNT(*) AS total_orders,
        SUM(CASE WHEN o.status IN ('paid', 'completed') THEN 1 ELSE 0 END) AS confirmed_orders,
        SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
        SUM(CASE WHEN o.payment_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_payments,
        SUM(CASE WHEN o.payment_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_payments,
        SUM(CASE WHEN o.order_type = 'delivery' AND o.delivery_status = 'delivered' THEN 1 ELSE 0 END) AS deliveries_completed,
        SUM(CASE WHEN o.order_type = 'delivery' AND o.delivery_status = 'return_to_branch' THEN 1 ELSE 0 END) AS deliveries_returned,
        COALESCE(
          SUM(
            CASE
              WHEN o.status IN ('paid', 'completed') THEN COALESCE(items.items_total, 0) + COALESCE(o.delivery_fee, 0)
              ELSE 0
            END
          ),
          0
        ) AS total_revenue
      FROM orders o
      LEFT JOIN (
        SELECT order_id, SUM(quantity * price) AS items_total
        FROM order_items
        GROUP BY order_id
      ) items ON items.order_id = o.id
      ${whereClause}
    `,
    params
  );

  const summary = summaryRows[0] || {};
  const confirmedOrders = Number(summary.confirmed_orders || 0);
  const totalRevenue = Number(summary.total_revenue || 0);

  const locationFilterSql = locationId ? "WHERE l.id = ?" : "";
  const locationParams = locationId ? [locationId, period.startDate, period.endDateExclusive, locationId] : [period.startDate, period.endDateExclusive];
  const [locationRows] = await db.query(
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
        AND o.created_at >= ?
        AND o.created_at < ?
        ${locationId ? "AND o.location_id = ?" : ""}
      LEFT JOIN (
        SELECT order_id, SUM(quantity * price) AS items_total
        FROM order_items
        GROUP BY order_id
      ) items ON items.order_id = o.id
      ${locationFilterSql}
      GROUP BY l.id, l.name
      ORDER BY l.name
    `,
    locationParams
  );

  const locationProductParams = [period.startDate, period.endDateExclusive];
  let locationProductSql = `
      SELECT
        l.id AS location_id,
        l.name AS location_name,
        p.id AS product_id,
        p.name AS product_name,
        SUM(oi.quantity) AS quantity_sold,
        SUM(oi.quantity * oi.price) AS revenue,
        AVG(oi.price) AS average_unit_price,
        MIN(oi.price) AS min_unit_price,
        MAX(oi.price) AS max_unit_price
      FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    INNER JOIN products p ON p.id = oi.product_id
    INNER JOIN locations l ON l.id = o.location_id
    WHERE o.created_at >= ?
      AND o.created_at < ?
      AND o.status IN ('paid', 'completed')
  `;
  if (locationId) {
    locationProductSql += " AND o.location_id = ?";
    locationProductParams.push(locationId);
  }
  locationProductSql += `
      GROUP BY l.id, l.name, p.id, p.name
      ORDER BY l.name, quantity_sold DESC, revenue DESC, p.name
    `;
  const [locationProductRows] = await db.query(locationProductSql, locationProductParams);

  const topProductParams = [period.startDate, period.endDateExclusive];
  let topProductSql = `
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      SUM(oi.quantity) AS quantity_sold,
      SUM(oi.quantity * oi.price) AS revenue
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    INNER JOIN products p ON p.id = oi.product_id
    WHERE o.created_at >= ?
      AND o.created_at < ?
      AND o.status IN ('paid', 'completed')
  `;
  if (locationId) {
    topProductSql += " AND o.location_id = ?";
    topProductParams.push(locationId);
  }
  topProductSql += `
    GROUP BY p.id, p.name
    ORDER BY quantity_sold DESC, revenue DESC, p.name
    LIMIT 10
  `;
  const [topProducts] = await db.query(topProductSql, topProductParams);

  const promoParams = [period.endDateExclusive, period.startDate];
  let promoSql = `
    SELECT id, title, price_label, kind, period_label, start_date, end_date, is_active
    FROM promotions
    WHERE is_active = TRUE
      AND (start_date IS NULL OR start_date < ?)
      AND (end_date IS NULL OR end_date >= ?)
  `;
  promoSql += " ORDER BY kind, sort_order, id";
  const [promotions] = await db.query(promoSql, promoParams);

  const productsByLocation = locationProductRows.reduce((accumulator, row) => {
    const key = Number(row.location_id);
    if (!accumulator[key]) accumulator[key] = [];
      accumulator[key].push({
        product_id: Number(row.product_id),
        product_name: row.product_name,
        quantity_sold: Number(row.quantity_sold || 0),
        revenue: Number(row.revenue || 0),
        average_unit_price: Number(row.average_unit_price || 0),
        min_unit_price: Number(row.min_unit_price || 0),
        max_unit_price: Number(row.max_unit_price || 0)
      });
    return accumulator;
  }, {});

  return {
    period: {
      year: period.year,
      month: period.month,
      label: period.label,
      start_date: period.startDate,
      end_date_exclusive: period.endDateExclusive
    },
    scope,
    location_id: locationId,
    generated_for: actor.role === "manager" ? actor.assigned_location_name : "Reseau complet",
    summary: {
      total_orders: Number(summary.total_orders || 0),
      confirmed_orders: confirmedOrders,
      cancelled_orders: Number(summary.cancelled_orders || 0),
      confirmed_payments: Number(summary.confirmed_payments || 0),
      rejected_payments: Number(summary.rejected_payments || 0),
      deliveries_completed: Number(summary.deliveries_completed || 0),
      deliveries_returned: Number(summary.deliveries_returned || 0),
      total_revenue: totalRevenue,
      average_basket: confirmedOrders ? totalRevenue / confirmedOrders : 0
    },
    locations: locationRows.map(row => ({
      location_id: Number(row.location_id),
      location_name: row.location_name,
      revenue: Number(row.revenue || 0),
      confirmed_orders: Number(row.confirmed_orders || 0),
      products_sold: (productsByLocation[Number(row.location_id)] || []).slice(0, 10)
    })),
      top_products: topProducts.map(row => ({
        product_id: Number(row.product_id),
        product_name: row.product_name,
        quantity_sold: Number(row.quantity_sold || 0),
        revenue: Number(row.revenue || 0)
    })),
    promotions: promotions.map(row => ({
      id: Number(row.id),
      title: row.title,
      price_label: row.price_label || "",
      kind: row.kind,
      period_label: row.period_label || ""
    }))
  };
}

async function loadStoredMonthlyAudit(actor, period) {
  const scope = actor.role === "manager" ? "location" : "global";
  const locationId = actor.role === "manager" ? Number(actor.assigned_location_id) : null;
  const [rows] = await db.query(
    `
      SELECT *
      FROM monthly_audit_reports
      WHERE report_year = ?
        AND report_month = ?
        AND scope = ?
        AND location_id <=> ?
      ORDER BY generated_at DESC, id DESC
      LIMIT 1
    `,
    [period.year, period.month, scope, locationId]
  );

  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    generated_at: row.generated_at,
    generated_by: row.generated_by ? Number(row.generated_by) : null,
    payload: parseStoredPayload(row.report_payload)
  };
}

async function storeMonthlyAudit(actor, period, payload) {
  const scope = actor.role === "manager" ? "location" : "global";
  const locationId = actor.role === "manager" ? Number(actor.assigned_location_id) : null;
  const serialized = JSON.stringify(payload);

  const [updateResult] = await db.query(
    `
      UPDATE monthly_audit_reports
      SET
        report_payload = ?,
        generated_by = ?,
        generated_at = CURRENT_TIMESTAMP
      WHERE report_year = ?
        AND report_month = ?
        AND scope = ?
        AND location_id <=> ?
    `,
    [serialized, actor.id, period.year, period.month, scope, locationId]
  );

  if (!updateResult.affectedRows) {
    await db.query(
      `
        INSERT INTO monthly_audit_reports (report_year, report_month, scope, location_id, report_payload, generated_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [period.year, period.month, scope, locationId, serialized, actor.id]
    );
  } else {
    await db.query(
      `
        DELETE FROM monthly_audit_reports
        WHERE report_year = ?
          AND report_month = ?
          AND scope = ?
          AND location_id <=> ?
          AND id NOT IN (
            SELECT keep_id
            FROM (
              SELECT id AS keep_id
              FROM monthly_audit_reports
              WHERE report_year = ?
                AND report_month = ?
                AND scope = ?
                AND location_id <=> ?
              ORDER BY generated_at DESC, id DESC
              LIMIT 1
            ) AS latest
          )
      `,
      [period.year, period.month, scope, locationId, period.year, period.month, scope, locationId]
    );
  }

  return loadStoredMonthlyAudit(actor, period);
}

async function computeDriverWeeklyReport(actor, period) {
  const scope = actor.role === "manager" ? "location" : "global";
  const locationId = actor.role === "manager" ? Number(actor.assigned_location_id) : null;
  const driverFilter = locationId ? "AND u.assigned_location_id = ?" : "";
  const driverParams = locationId ? [locationId] : [];
  const orderLocationFilter = locationId ? "AND o.location_id = ?" : "";
  const baseOrderParams = [period.weekStart, period.weekEndExclusive];
  const orderParams = locationId ? [...baseOrderParams, locationId] : baseOrderParams;

  const [driverRows] = await db.query(
    `
      SELECT
        u.id AS driver_id,
        u.name AS driver_name,
        u.phone AS driver_phone,
        u.assigned_location_id,
        l.name AS assigned_location_name
      FROM users u
      LEFT JOIN locations l ON l.id = u.assigned_location_id
      WHERE u.role = 'driver'
        AND u.is_active = TRUE
        ${driverFilter}
      ORDER BY u.name
    `,
    driverParams
  );

  const [orderRows] = await db.query(
    `
      SELECT
        o.id AS order_id,
        o.assigned_driver_id AS driver_id,
        o.location_id,
        l.name AS location_name,
        u.name AS customer_name,
        o.delivery_status,
        o.delivery_fee,
        o.delivery_address,
        CASE
          WHEN o.delivery_status = 'delivered' THEN o.delivered_at
          ELSE o.returned_at
        END AS event_at,
        COALESCE(items.items_total, 0) + COALESCE(o.delivery_fee, 0) AS order_total
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN locations l ON l.id = o.location_id
      LEFT JOIN (
        SELECT order_id, SUM(quantity * price) AS items_total
        FROM order_items
        GROUP BY order_id
      ) items ON items.order_id = o.id
      WHERE o.order_type = 'delivery'
        AND o.assigned_driver_id IS NOT NULL
        AND (
          (o.delivery_status = 'delivered' AND o.delivered_at >= ? AND o.delivered_at < ?)
          OR
          (o.delivery_status = 'return_to_branch' AND o.returned_at >= ? AND o.returned_at < ?)
        )
        ${orderLocationFilter}
      ORDER BY event_at ASC, o.id ASC
    `,
    locationId ? [period.weekStart, period.weekEndExclusive, period.weekStart, period.weekEndExclusive, locationId] : [period.weekStart, period.weekEndExclusive, period.weekStart, period.weekEndExclusive]
  );

  const ordersByDriver = orderRows.reduce((accumulator, row) => {
    const key = Number(row.driver_id);
    if (!accumulator[key]) accumulator[key] = [];
    accumulator[key].push({
      order_id: Number(row.order_id),
      location_id: Number(row.location_id),
      location_name: row.location_name || "",
      customer_name: row.customer_name || "Client",
      delivery_status: row.delivery_status,
      delivery_fee: Number(row.delivery_fee || 0),
      delivery_address: row.delivery_address || "",
      order_total: Number(row.order_total || 0),
      event_at: row.event_at,
      event_at_label: row.event_at ? formatTimestamp(row.event_at) : "Date indisponible"
    });
    return accumulator;
  }, {});

  const drivers = driverRows.map(row => {
    const driverOrders = ordersByDriver[Number(row.driver_id)] || [];
    const deliveredOrders = driverOrders.filter(order => order.delivery_status === "delivered");
    const returnedOrders = driverOrders.filter(order => order.delivery_status === "return_to_branch");

    return {
      driver_id: Number(row.driver_id),
      driver_name: row.driver_name,
      driver_phone: row.driver_phone || "",
      assigned_location_id: row.assigned_location_id ? Number(row.assigned_location_id) : null,
      assigned_location_name: row.assigned_location_name || "",
      delivered_orders: deliveredOrders.length,
      returned_orders: returnedOrders.length,
      total_delivery_orders: driverOrders.length,
      delivery_fees_total: deliveredOrders.reduce((sum, order) => sum + Number(order.delivery_fee || 0), 0),
      orders: driverOrders
    };
  });

  return {
    period: {
      week_start: period.weekStart,
      week_end: period.weekEnding,
      week_end_exclusive: period.weekEndExclusive,
      label: period.label
    },
    scope,
    location_id: locationId,
    generated_for: actor.role === "manager" ? actor.assigned_location_name : "Reseau complet",
    summary: {
      total_drivers: drivers.length,
      delivered_orders: drivers.reduce((sum, driver) => sum + Number(driver.delivered_orders || 0), 0),
      returned_orders: drivers.reduce((sum, driver) => sum + Number(driver.returned_orders || 0), 0),
      total_delivery_orders: drivers.reduce((sum, driver) => sum + Number(driver.total_delivery_orders || 0), 0),
      total_delivery_fees: drivers.reduce((sum, driver) => sum + Number(driver.delivery_fees_total || 0), 0)
    },
    drivers
  };
}

async function loadStoredDriverWeeklyReport(actor, period) {
  const scope = actor.role === "manager" ? "location" : "global";
  const locationId = actor.role === "manager" ? Number(actor.assigned_location_id) : null;
  const [rows] = await db.query(
    `
      SELECT *
      FROM weekly_driver_reports
      WHERE week_start_date = ?
        AND week_end_date = ?
        AND scope = ?
        AND location_id <=> ?
      ORDER BY generated_at DESC, id DESC
      LIMIT 1
    `,
    [period.weekStart, period.weekEnding, scope, locationId]
  );

  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    generated_at: row.generated_at,
    generated_by: row.generated_by ? Number(row.generated_by) : null,
    payload: parseStoredPayload(row.report_payload)
  };
}

async function storeDriverWeeklyReport(actor, period, payload) {
  const scope = actor.role === "manager" ? "location" : "global";
  const locationId = actor.role === "manager" ? Number(actor.assigned_location_id) : null;
  const serialized = JSON.stringify(payload);

  const [updateResult] = await db.query(
    `
      UPDATE weekly_driver_reports
      SET
        report_payload = ?,
        generated_by = ?,
        generated_at = CURRENT_TIMESTAMP
      WHERE week_start_date = ?
        AND week_end_date = ?
        AND scope = ?
        AND location_id <=> ?
    `,
    [serialized, actor.id, period.weekStart, period.weekEnding, scope, locationId]
  );

  if (!updateResult.affectedRows) {
    await db.query(
      `
        INSERT INTO weekly_driver_reports (week_start_date, week_end_date, scope, location_id, report_payload, generated_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [period.weekStart, period.weekEnding, scope, locationId, serialized, actor.id]
    );
  }

  return loadStoredDriverWeeklyReport(actor, period);
}

exports.__monthlyAuditInternals = {
  getPreviousMonthSnapshot,
  normalizeAuditPeriod,
  computeMonthlyAuditReport,
  loadStoredMonthlyAudit,
  storeMonthlyAudit
};

exports.getMonthlyAuditReport = async (req, res) => {
  try {
    const actor = await getScopedUser(req.user.id);
    const period = normalizeAuditPeriod(req.query);
    const stored = await loadStoredMonthlyAudit(actor, period);
    const payload = stored?.payload || (await computeMonthlyAuditReport(actor, period));

    res.json({
      report: payload,
      snapshot: stored
        ? {
            id: stored.id,
            generated_at: stored.generated_at,
            generated_by: stored.generated_by
          }
        : null
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer le rapport mensuel", error: error.message });
  }
};

exports.generateMonthlyAuditReport = async (req, res) => {
  try {
    const actor = await getScopedUser(req.user.id);
    const period = normalizeAuditPeriod(req.body || req.query);
    const payload = await computeMonthlyAuditReport(actor, period);
    const stored = await storeMonthlyAudit(actor, period, payload);

    res.json({
      message: "Rapport mensuel genere avec succes",
      report: payload,
      snapshot: stored
        ? {
            id: stored.id,
            generated_at: stored.generated_at,
            generated_by: stored.generated_by
          }
        : null
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de generer le rapport mensuel", error: error.message });
  }
};

exports.exportMonthlyAuditReportCsv = async (req, res) => {
  try {
    const actor = await getScopedUser(req.user.id);
    const period = normalizeAuditPeriod(req.query);
    const stored = await loadStoredMonthlyAudit(actor, period);
    const payload = stored?.payload || (await computeMonthlyAuditReport(actor, period));
    const csv = buildAuditCsv(payload);
    const scopeLabel = actor.role === "manager" ? `-${String(actor.assigned_location_name || "succursale").replace(/\s+/g, "-").toLowerCase()}` : "";
    const filename = `audit-${period.year}-${String(period.month).padStart(2, "0")}${scopeLabel}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    res.status(500).json({ message: "Impossible d'exporter le rapport mensuel", error: error.message });
  }
};

exports.exportMonthlyAuditReportPdf = async (req, res) => {
  try {
    const actor = await getScopedUser(req.user.id);
    const period = normalizeAuditPeriod(req.query);
    const stored = await loadStoredMonthlyAudit(actor, period);
    const payload = stored?.payload || (await computeMonthlyAuditReport(actor, period));
    const pdfBuffer = buildSimplePdfBuffer(buildAuditPdfLines(payload));
    const scopeLabel =
      actor.role === "manager"
        ? `-${String(actor.assigned_location_name || "succursale").replace(/\s+/g, "-").toLowerCase()}`
        : "";
    const filename = `audit-${period.year}-${String(period.month).padStart(2, "0")}${scopeLabel}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ message: "Impossible d'exporter le rapport mensuel PDF", error: error.message });
  }
};

exports.getDriverWeeklyReport = async (req, res) => {
  try {
    const actor = await getScopedUser(req.user.id);
    const period = normalizeDriverWeekPeriod(req.query);
    const stored = await loadStoredDriverWeeklyReport(actor, period);
    const payload = stored?.payload || (await computeDriverWeeklyReport(actor, period));

    res.json({
      report: payload,
      snapshot: stored
        ? {
            id: stored.id,
            generated_at: stored.generated_at,
            generated_by: stored.generated_by
          }
        : null
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer le rapport chauffeur", error: error.message });
  }
};

exports.generateDriverWeeklyReport = async (req, res) => {
  try {
    const actor = await getScopedUser(req.user.id);
    const period = normalizeDriverWeekPeriod(req.body || req.query);
    const payload = await computeDriverWeeklyReport(actor, period);
    const stored = await storeDriverWeeklyReport(actor, period, payload);

    res.json({
      message: "Rapport chauffeur genere avec succes",
      report: payload,
      snapshot: stored
        ? {
            id: stored.id,
            generated_at: stored.generated_at,
            generated_by: stored.generated_by
          }
        : null
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de generer le rapport chauffeur", error: error.message });
  }
};

exports.exportDriverWeeklyReportPdf = async (req, res) => {
  try {
    const actor = await getScopedUser(req.user.id);
    const period = normalizeDriverWeekPeriod(req.query);
    const stored = await loadStoredDriverWeeklyReport(actor, period);
    const payload = stored?.payload || (await computeDriverWeeklyReport(actor, period));
    const pdfBuffer = buildSimplePdfBuffer(buildDriverWeeklyPdfLines(payload));
    const scopeLabel =
      actor.role === "manager"
        ? `-${String(actor.assigned_location_name || "succursale").replace(/\s+/g, "-").toLowerCase()}`
        : "";
    const filename = `livreurs-${period.weekEnding}${scopeLabel}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ message: "Impossible d'exporter le rapport chauffeur PDF", error: error.message });
  }
};

exports.getPaymentProofMaintenance = async (req, res) => {
  try {
    const stats = await getPaymentProofCleanupStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      message: "Impossible de recuperer les informations de maintenance des commandes archivees",
      error: error.message
    });
  }
};

exports.runPaymentProofMaintenance = async (req, res) => {
  try {
    const result = await runPaymentProofCleanup({ trigger: "manual" });
    res.json({
      message: result.alreadyRunning
        ? result.message
        : `${result.deletedOrders} commande(s) archivee(s), ${result.deletedNotifications} notification(s) et ${result.filesDeleted} preuve(s) nettoyee(s) avec succes.`,
      result
    });
  } catch (error) {
    res.status(500).json({
      message: "Impossible de lancer le nettoyage des commandes archivees",
      error: error.message
    });
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

exports.getSecurityEvents = async (req, res) => {
  try {
    const [[summaryRow]] = await db.query(
      `
        SELECT
          COUNT(*) AS total_events,
          SUM(CASE WHEN severity = 'info' THEN 1 ELSE 0 END) AS info_events,
          SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) AS warning_events,
          SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical_events
        FROM security_events
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `
    );

    const [rows] = await db.query(
      `
        SELECT
          id,
          event_type,
          severity,
          user_id,
          email,
          ip_address,
          details,
          created_at
        FROM security_events
        ORDER BY id DESC
        LIMIT 20
      `
    );

    const events = rows.map(row => ({
      ...row,
      details:
        typeof row.details === "string"
          ? (() => {
              try {
                return JSON.parse(row.details);
              } catch (error) {
                return row.details;
              }
            })()
          : row.details
    }));

    res.json({
      summary: {
        total_events: Number(summaryRow.total_events || 0),
        info_events: Number(summaryRow.info_events || 0),
        warning_events: Number(summaryRow.warning_events || 0),
        critical_events: Number(summaryRow.critical_events || 0)
      },
      events
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer les evenements de securite", error: error.message });
  }
};
