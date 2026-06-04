const db = require("../config/db");
const { generateQrPayload } = require("../services/qr.service");

exports.createNotificationForUser = async (userId, message) => {
  await db.query("INSERT INTO notifications (user_id, message) VALUES (?, ?)", [userId, message]);
};

exports.createNotificationForRole = async (role, message) => {
  const [users] = await db.query("SELECT id FROM users WHERE role = ? AND is_active = TRUE", [role]);

  await Promise.all(users.map(user => exports.createNotificationForUser(user.id, message)));
};

exports.createNotificationForManagersAtLocation = async (locationId, message) => {
  const [users] = await db.query(
    "SELECT id FROM users WHERE role = 'manager' AND is_active = TRUE AND assigned_location_id = ?",
    [locationId]
  );

  await Promise.all(users.map(user => exports.createNotificationForUser(user.id, message)));
};

exports.createNotificationForDriversAtLocation = async (locationId, message) => {
  const [users] = await db.query(
    "SELECT id FROM users WHERE role = 'driver' AND is_active = TRUE AND assigned_location_id = ?",
    [locationId]
  );

  await Promise.all(users.map(user => exports.createNotificationForUser(user.id, message)));
};

exports.getUserContact = async userId => {
  const [users] = await db.query(
    "SELECT id, name, email, phone, role, assigned_location_id FROM users WHERE id = ? LIMIT 1",
    [userId]
  );

  return users[0] || null;
};

exports.getManagersAtLocation = async locationId => {
  const [users] = await db.query(
    "SELECT id, name, email, phone, assigned_location_id FROM users WHERE role = 'manager' AND is_active = TRUE AND assigned_location_id = ?",
    [locationId]
  );

  return users;
};

exports.getDriversAtLocation = async locationId => {
  const [users] = await db.query(
    "SELECT id, name, email, phone, assigned_location_id FROM users WHERE role = 'driver' AND is_active = TRUE AND assigned_location_id = ?",
    [locationId]
  );

  return users;
};

exports.getClientCreditBalance = async (userId, connection = db) => {
  const [[row]] = await connection.query(
    `
      SELECT COALESCE(
        SUM(
          CASE
            WHEN payment_method = 'credit' AND credit_settlement_status IN ('open', 'partial')
              THEN GREATEST(COALESCE(credit_amount, 0) - COALESCE(credit_settled_amount, 0), 0)
            ELSE 0
          END
        ),
        0
      ) AS balance
      FROM orders
      WHERE user_id = ?
    `,
    [userId]
  );

  return Number(row.balance || 0);
};

exports.getClientCreditPayments = async (userId, limit = 20, connection = db) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const [rows] = await connection.query(
    `
      SELECT
        cp.id,
        cp.user_id,
        cp.order_id,
        cp.amount,
        cp.payment_channel,
        cp.note,
        cp.paid_at,
        cp.created_at,
        recorder.name AS recorded_by_name
      FROM credit_payments cp
      LEFT JOIN users recorder ON recorder.id = cp.recorded_by
      WHERE cp.user_id = ?
      ORDER BY cp.paid_at DESC, cp.id DESC
      LIMIT ${safeLimit}
    `,
    [userId]
  );

  return rows;
};

exports.getScopedUser = async userId => {
  const [rows] = await db.query(
    `
      SELECT
        u.id,
        u.name,
        u.email,
        u.email_verified,
        u.email_verified_at,
        u.phone,
        u.bio,
        u.avatar_url,
        u.title,
        u.role,
        u.credit_enabled,
        u.credit_limit,
        u.credit_status,
        u.credit_note,
        u.assigned_location_id,
        u.is_active,
        l.name AS assigned_location_name
      FROM users u
      LEFT JOIN locations l ON l.id = u.assigned_location_id
      WHERE u.id = ?
    `,
    [userId]
  );

  const user = rows[0] || null;
  if (!user) return null;

  return {
    ...user,
    credit_enabled: Boolean(user.credit_enabled),
    credit_limit: Number(user.credit_limit || 0),
    current_credit_balance: await exports.getClientCreditBalance(user.id)
  };
};

exports.fetchOrderByIdWithDetails = async orderId => {
  const [orders] = await db.query(
    `
      SELECT
        o.*,
        u.name AS customer_name,
        u.email AS customer_email,
        u.phone AS customer_phone,
        l.name AS location_name,
        l.address AS location_address,
        validator.name AS validator_name,
        confirmer.name AS confirmer_name,
        driver.name AS driver_name
      FROM orders o
      INNER JOIN users u ON u.id = o.user_id
      INNER JOIN locations l ON l.id = o.location_id
      LEFT JOIN users validator ON validator.id = o.validated_by
      LEFT JOIN users confirmer ON confirmer.id = o.confirmed_by
      LEFT JOIN users driver ON driver.id = o.assigned_driver_id
      WHERE o.id = ?
    `,
    [orderId]
  );

  const order = orders[0];
  if (!order) return null;

  const [items] = await db.query(
    `
      SELECT
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.quantity,
        oi.price,
        p.name,
        p.description,
        p.image
      FROM order_items oi
      INNER JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `,
    [orderId]
  );

  const total =
    items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0) + Number(order.delivery_fee || 0);

  return {
    ...order,
    total,
    items,
    qrCode: order.qr_code_token ? await generateQrPayload(order.qr_code_token, Number(orderId)) : null
  };
};
