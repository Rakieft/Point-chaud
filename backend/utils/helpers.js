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

exports.getScopedUser = async userId => {
  const [rows] = await db.query(
    `
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
        l.name AS assigned_location_name
      FROM users u
      LEFT JOIN locations l ON l.id = u.assigned_location_id
      WHERE u.id = ?
    `,
    [userId]
  );

  return rows[0] || null;
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
