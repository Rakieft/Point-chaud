const db = require("../config/db");
const { validateOrderPayload } = require("../validators/order.validator");
const { createNotificationForRole, createNotificationForUser } = require("../utils/helpers");
const { generateQrPayload } = require("../services/qr.service");
const { sendSmsNotification } = require("../services/sms.service");

const orderSelect = `
  SELECT
    o.*,
    u.name AS customer_name,
    u.email AS customer_email,
    u.phone AS customer_phone,
    l.name AS location_name,
    l.address AS location_address,
    validator.name AS validator_name,
    confirmer.name AS confirmer_name
  FROM orders o
  INNER JOIN users u ON u.id = o.user_id
  INNER JOIN locations l ON l.id = o.location_id
  LEFT JOIN users validator ON validator.id = o.validated_by
  LEFT JOIN users confirmer ON confirmer.id = o.confirmed_by
`;

async function getOrderItems(orderId) {
  const [items] = await db.query(
    `SELECT
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
    WHERE oi.order_id = ?`,
    [orderId]
  );

  return items;
}

async function mapOrder(order) {
  const items = await getOrderItems(order.id);
  const total = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const qrCode = order.qr_code_token ? await generateQrPayload(order.qr_code_token, order.id) : null;

  return {
    ...order,
    total,
    items,
    qrCode
  };
}

exports.createOrder = async (req, res) => {
  const { isValid, message } = validateOrderPayload(req.body);

  if (!isValid) {
    return res.status(400).json({ message });
  }

  const { location_id, pickup_date, pickup_time, notes, items } = req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const productIds = items.map(item => item.product_id);
    const [products] = await connection.query(
      `SELECT id, name, price, stock FROM products WHERE id IN (${productIds.map(() => "?").join(",")})`,
      productIds
    );

    if (products.length !== items.length) {
      throw new Error("Un ou plusieurs produits sont introuvables");
    }

    const productMap = new Map(products.map(product => [product.id, product]));

    for (const item of items) {
      const product = productMap.get(item.product_id);
      if (!product || product.stock < item.quantity) {
        throw new Error(`Stock insuffisant pour ${product ? product.name : "un produit"}`);
      }
    }

    const [result] = await connection.query(
      `INSERT INTO orders (
        user_id,
        status,
        location_id,
        pickup_date,
        pickup_time,
        notes,
        payment_status
      ) VALUES (?, 'pending_validation', ?, ?, ?, ?, 'pending')`,
      [req.user.id, location_id, pickup_date, pickup_time, notes || null]
    );

    for (const item of items) {
      const product = productMap.get(item.product_id);
      await connection.query(
        "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
        [result.insertId, item.product_id, item.quantity, product.price]
      );

      await connection.query("UPDATE products SET stock = stock - ? WHERE id = ?", [
        item.quantity,
        item.product_id
      ]);
    }

    await connection.commit();

    await createNotificationForRole(
      "manager",
      `Nouvelle commande #${result.insertId} en attente de validation.`
    );

    sendSmsNotification(
      null,
      `Commande #${result.insertId} recue. Elle sera validee par un manager avant paiement.`
    );

    const [orders] = await db.query(`${orderSelect} WHERE o.id = ?`, [result.insertId]);
    const order = await mapOrder(orders[0]);

    res.status(201).json({
      message: "Commande enregistree avec succes",
      order
    });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ message: error.message || "Impossible de creer la commande" });
  } finally {
    connection.release();
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const [orders] = await db.query(`${orderSelect} WHERE o.user_id = ? ORDER BY o.created_at DESC`, [
      req.user.id
    ]);

    const mappedOrders = await Promise.all(orders.map(mapOrder));
    res.json(mappedOrders);
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer les commandes", error: error.message });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const [orders] = await db.query(`${orderSelect} ORDER BY o.created_at DESC`);
    const mappedOrders = await Promise.all(orders.map(mapOrder));
    res.json(mappedOrders);
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer les commandes", error: error.message });
  }
};

exports.validateOrder = async (req, res) => {
  const { action } = req.body;

  if (!["validate", "reject"].includes(action)) {
    return res.status(400).json({ message: "Action invalide" });
  }

  try {
    const [orders] = await db.query("SELECT * FROM orders WHERE id = ?", [req.params.id]);

    if (!orders.length) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    const order = orders[0];

    if (order.status !== "pending_validation") {
      return res.status(400).json({ message: "Cette commande a deja ete traitee" });
    }

    const nextStatus = action === "validate" ? "awaiting_payment" : "cancelled";

    await db.query(
      `UPDATE orders
       SET status = ?, validated_by = ?, validated_at = NOW()
       WHERE id = ?`,
      [nextStatus, req.user.id, req.params.id]
    );

    const message =
      action === "validate"
        ? `Votre commande #${req.params.id} a ete validee. Vous pouvez maintenant payer.`
        : `Votre commande #${req.params.id} a ete refusee.`;

    await createNotificationForUser(order.user_id, message);
    sendSmsNotification(null, message);

    const [updatedOrders] = await db.query(`${orderSelect} WHERE o.id = ?`, [req.params.id]);
    const updatedOrder = await mapOrder(updatedOrders[0]);

    res.json({
      message: action === "validate" ? "Commande validee" : "Commande refusee",
      order: updatedOrder
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de traiter la commande", error: error.message });
  }
};

exports.scanOrder = async (req, res) => {
  try {
    const [orders] = await db.query(`${orderSelect} WHERE o.qr_code_token = ?`, [req.params.token]);

    if (!orders.length) {
      return res.status(404).json({ message: "QR code invalide" });
    }

    const order = orders[0];

    if (order.status === "completed") {
      return res.status(400).json({ message: "Cette commande a deja ete retiree" });
    }

    if (order.status !== "paid") {
      return res.status(400).json({ message: "Le paiement n'est pas encore confirme" });
    }

    await db.query("UPDATE orders SET status = 'completed' WHERE id = ?", [order.id]);
    await createNotificationForUser(order.user_id, `Commande #${order.id} recuperee avec succes.`);

    const [updatedOrders] = await db.query(`${orderSelect} WHERE o.id = ?`, [order.id]);
    const updatedOrder = await mapOrder(updatedOrders[0]);

    res.json({
      message: "Commande remise avec succes",
      order: updatedOrder
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de scanner la commande", error: error.message });
  }
};
