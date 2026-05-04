const db = require("../config/db");
const { validateOrderPayload } = require("../validators/order.validator");
const {
  createNotificationForUser,
  createNotificationForManagersAtLocation,
  createNotificationForDriversAtLocation,
  getScopedUser,
  getUserContact,
  getManagersAtLocation,
  getDriversAtLocation
} = require("../utils/helpers");
const { generateQrPayload } = require("../services/qr.service");
const { sendSmsNotification } = require("../services/sms.service");
const { ensureLocationStockRows, syncProductTotalStocks } = require("../utils/stock");

const orderSelect = `
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
`;

function getDeliveryFee(locationId, orderType) {
  if (orderType !== "delivery") return 0;

  const fees = {
    1: 180,
    2: 220,
    3: 160
  };

  return fees[Number(locationId)] || 200;
}

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

async function getActor(userId) {
  return getScopedUser(userId);
}

async function getScopedOrdersQuery(user, extraWhere = "", extraParams = []) {
  const params = [];
  const clauses = [];

  if (user.role === "manager") {
    clauses.push("o.location_id = ?");
    params.push(user.assigned_location_id);
  } else if (user.role === "driver") {
    clauses.push("o.assigned_driver_id = ?");
    params.push(user.id);
  }

  if (extraWhere) {
    clauses.push(extraWhere);
    params.push(...extraParams);
  }

  const whereClause = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  return { whereClause, params };
}

async function mapOrder(order) {
  const items = await getOrderItems(order.id);
  const total =
    items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0) + Number(order.delivery_fee || 0);
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

  const { location_id, pickup_date, pickup_time, notes, items, order_type, delivery_address, delivery_zone } =
    req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const productIds = items.map(item => item.product_id);
    const [products] = await connection.query(
      `
        SELECT
          p.id,
          p.name,
          p.price,
          COALESCE(ps.stock, 0) AS stock
        FROM products p
        LEFT JOIN product_stocks ps ON ps.product_id = p.id AND ps.location_id = ?
        WHERE p.id IN (${productIds.map(() => "?").join(",")})
      `,
      [location_id, ...productIds]
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

    const nextOrderType = order_type === "delivery" ? "delivery" : "pickup";
    const deliveryFee = getDeliveryFee(location_id, nextOrderType);

    const [result] = await connection.query(
      `INSERT INTO orders (
        user_id,
        status,
        location_id,
        pickup_date,
        pickup_time,
        order_type,
        delivery_address,
        delivery_zone,
        delivery_fee,
        notes,
        payment_status
      ) VALUES (?, 'pending_validation', ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        req.user.id,
        location_id,
        pickup_date,
        pickup_time,
        nextOrderType,
        nextOrderType === "delivery" ? delivery_address || null : null,
        nextOrderType === "delivery" ? delivery_zone || null : null,
        deliveryFee,
        notes || null
      ]
    );

    for (const item of items) {
      const product = productMap.get(item.product_id);
      await connection.query(
        "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
        [result.insertId, item.product_id, item.quantity, product.price]
      );

      await ensureLocationStockRows(connection, item.product_id, Number(product.stock || 0));
      await connection.query(
        "UPDATE product_stocks SET stock = stock - ? WHERE product_id = ? AND location_id = ?",
        [item.quantity, item.product_id, location_id]
      );
    }

    await syncProductTotalStocks(connection, productIds);

    await connection.commit();

    await createNotificationForManagersAtLocation(
      location_id,
      `Nouvelle commande #${result.insertId} en attente de validation.`
    );

    const [customerContact, managerContacts] = await Promise.all([
      getUserContact(req.user.id),
      getManagersAtLocation(location_id)
    ]);

    await Promise.all([
      sendSmsNotification(
        customerContact?.phone,
        `Point Chaud: commande #${result.insertId} recue. Attends la validation avant de payer.`
      ),
      ...managerContacts.map(manager =>
        sendSmsNotification(manager.phone, `Point Chaud: nouvelle commande #${result.insertId} a valider.`)
      )
    ]);

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
    const actor = await getActor(req.user.id);
    const group = req.query.group || "all";
    let filter = "";
    let extraParams = [];

    if (group === "pending") {
      filter = "o.status IN ('pending_validation', 'awaiting_payment')";
    } else if (group === "validated") {
      filter = "o.status IN ('paid', 'completed', 'cancelled')";
    } else if (group === "delivery") {
      filter = "o.order_type = 'delivery' AND o.status IN ('paid', 'completed')";
    }

    const { whereClause, params } = await getScopedOrdersQuery(actor, filter, extraParams);
    const [orders] = await db.query(`${orderSelect}${whereClause} ORDER BY o.created_at DESC`, params);
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
    const actor = await getActor(req.user.id);
    const [orders] = await db.query("SELECT * FROM orders WHERE id = ?", [req.params.id]);

    if (!orders.length) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    const order = orders[0];

    if (actor.role === "manager" && Number(actor.assigned_location_id) !== Number(order.location_id)) {
      return res.status(403).json({ message: "Vous ne pouvez valider que les commandes de votre point de vente" });
    }

    if (order.status !== "pending_validation") {
      return res.status(400).json({ message: "Cette commande a deja ete traitee" });
    }

    const nextStatus = action === "validate" ? "awaiting_payment" : "cancelled";

    await db.query(
      `UPDATE orders
       SET status = ?, payment_status = ?, validated_by = ?, validated_at = NOW()
       WHERE id = ?`,
      [nextStatus, action === "validate" ? order.payment_status : "rejected", req.user.id, req.params.id]
    );

    const message =
      action === "validate"
        ? `Votre commande #${req.params.id} a ete validee. Vous pouvez maintenant payer.`
        : `Votre commande #${req.params.id} a ete refusee.`;

    await createNotificationForUser(order.user_id, message);
    const customerContact = await getUserContact(order.user_id);
    await sendSmsNotification(customerContact?.phone, `Point Chaud: ${message}`);

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

exports.updateOrderByStaff = async (req, res) => {
  const { pickup_date, pickup_time, notes, items } = req.body;
  const connection = await db.getConnection();

  try {
    const actor = await getActor(req.user.id);
    const [orders] = await connection.query("SELECT * FROM orders WHERE id = ?", [req.params.id]);

    if (!orders.length) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    const order = orders[0];

    if (actor.role === "manager" && Number(actor.assigned_location_id) !== Number(order.location_id)) {
      return res.status(403).json({ message: "Acces refuse pour cette succursale" });
    }

    if (order.status !== "pending_validation") {
      return res.status(400).json({ message: "Seules les commandes en attente peuvent etre ajustees" });
    }

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: "La commande doit contenir au moins un produit" });
    }

    await connection.beginTransaction();

    const [existingItems] = await connection.query(
      "SELECT product_id, quantity FROM order_items WHERE order_id = ?",
      [req.params.id]
    );

    for (const item of existingItems) {
      await ensureLocationStockRows(connection, item.product_id);
      await connection.query(
        "UPDATE product_stocks SET stock = stock + ? WHERE product_id = ? AND location_id = ?",
        [item.quantity, item.product_id, order.location_id]
      );
    }

    const productIds = items.map(item => item.product_id);
    const [products] = await connection.query(
      `
        SELECT
          p.id,
          p.name,
          p.price,
          COALESCE(ps.stock, 0) AS stock
        FROM products p
        LEFT JOIN product_stocks ps ON ps.product_id = p.id AND ps.location_id = ?
        WHERE p.id IN (${productIds.map(() => "?").join(",")})
      `,
      [order.location_id, ...productIds]
    );

    const productMap = new Map(products.map(product => [product.id, product]));

    for (const item of items) {
      const product = productMap.get(item.product_id);
      if (!product || Number(product.stock) < Number(item.quantity)) {
        throw new Error(`Stock insuffisant pour ${product ? product.name : "un produit"}`);
      }
    }

    await connection.query("DELETE FROM order_items WHERE order_id = ?", [req.params.id]);

    for (const item of items) {
      const product = productMap.get(item.product_id);
      await connection.query(
        "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
        [req.params.id, item.product_id, item.quantity, product.price]
      );

      await ensureLocationStockRows(connection, item.product_id);
      await connection.query(
        "UPDATE product_stocks SET stock = stock - ? WHERE product_id = ? AND location_id = ?",
        [item.quantity, item.product_id, order.location_id]
      );
    }

    await syncProductTotalStocks(connection, [...existingItems.map(item => item.product_id), ...productIds]);

    await connection.query(
      "UPDATE orders SET pickup_date = ?, pickup_time = ?, notes = ? WHERE id = ?",
      [pickup_date || order.pickup_date, pickup_time || order.pickup_time, notes || order.notes, req.params.id]
    );

    await connection.commit();

    await createNotificationForUser(
      order.user_id,
      `Votre commande #${order.id} a ete ajustee par le staff en fonction de l'horaire ou du stock disponible.`
    );
    const customerContact = await getUserContact(order.user_id);
    await sendSmsNotification(
      customerContact?.phone,
      `Point Chaud: la commande #${order.id} a ete ajustee. Verifie les nouveaux details dans ton espace client.`
    );

    const [updatedOrders] = await db.query(`${orderSelect} WHERE o.id = ?`, [req.params.id]);
    const updatedOrder = await mapOrder(updatedOrders[0]);

    res.json({ message: "Commande mise a jour", order: updatedOrder });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ message: error.message || "Impossible de modifier la commande" });
  } finally {
    connection.release();
  }
};

exports.scanOrder = async (req, res) => {
  try {
    const actor = await getActor(req.user.id);
    const [orders] = await db.query(`${orderSelect} WHERE o.qr_code_token = ?`, [req.params.token]);

    if (!orders.length) {
      return res.status(404).json({ message: "QR code invalide" });
    }

    const order = orders[0];

    if (actor.role === "manager" && Number(actor.assigned_location_id) !== Number(order.location_id)) {
      return res.status(403).json({ message: "Acces refuse pour cette succursale" });
    }

    if (order.status === "completed") {
      return res.status(400).json({ message: "Cette commande a deja ete retiree" });
    }

    if (order.status !== "paid") {
      return res.status(400).json({ message: "Le paiement n'est pas encore confirme" });
    }

    await db.query("UPDATE orders SET status = 'completed' WHERE id = ?", [order.id]);
    await createNotificationForUser(order.user_id, `Commande #${order.id} recuperee avec succes.`);
    const customerContact = await getUserContact(order.user_id);
    await sendSmsNotification(customerContact?.phone, `Point Chaud: commande #${order.id} remise avec succes.`);

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

exports.getDeliveryOrders = async (req, res) => {
  try {
    const actor = await getActor(req.user.id);
    const { whereClause, params } = await getScopedOrdersQuery(actor, "o.order_type = 'delivery'");
    const [orders] = await db.query(`${orderSelect}${whereClause} ORDER BY o.created_at DESC`, params);
    const mappedOrders = await Promise.all(orders.map(mapOrder));
    res.json(mappedOrders);
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer les livraisons", error: error.message });
  }
};

exports.assignDriver = async (req, res) => {
  const { driver_id } = req.body;

  if (!driver_id) {
    return res.status(400).json({ message: "Le livreur est obligatoire" });
  }

  try {
    const actor = await getActor(req.user.id);
    const [orders] = await db.query("SELECT * FROM orders WHERE id = ?", [req.params.id]);
    if (!orders.length) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    const order = orders[0];
    if (order.order_type !== "delivery") {
      return res.status(400).json({ message: "Cette commande n'est pas une livraison" });
    }
    if (order.status !== "paid") {
      return res.status(400).json({ message: "Le paiement doit etre confirme avant d'affecter un livreur" });
    }
    if (["out_for_delivery", "delivered"].includes(order.delivery_status) || order.status === "completed") {
      return res.status(400).json({
        message: "Cette livraison est deja en cours ou terminee. L'affectation ne peut plus etre changee."
      });
    }

    if (actor.role === "manager" && Number(actor.assigned_location_id) !== Number(order.location_id)) {
      return res.status(403).json({ message: "Acces refuse pour cette succursale" });
    }

    const [drivers] = await db.query(
      "SELECT id, assigned_location_id FROM users WHERE id = ? AND role = 'driver' AND is_active = TRUE",
      [driver_id]
    );

    if (!drivers.length) {
      return res.status(404).json({ message: "Livreur introuvable" });
    }

    const driver = drivers[0];
    if (Number(driver.assigned_location_id) !== Number(order.location_id)) {
      return res.status(400).json({ message: "Le livreur doit appartenir a la meme succursale" });
    }

    const reassignment = order.assigned_driver_id && Number(order.assigned_driver_id) !== Number(driver_id);

    await db.query("UPDATE orders SET assigned_driver_id = ?, delivery_status = 'assigned' WHERE id = ?", [
      driver_id,
      req.params.id
    ]);

    await createNotificationForUser(
      order.user_id,
      reassignment
        ? `Le livreur de votre commande #${order.id} a ete reaffecte.`
        : `Votre commande #${order.id} a ete affectee a un livreur.`
    );
    await createNotificationForUser(
      driver_id,
      reassignment
        ? `La livraison #${order.id} vous a ete reaffectee.`
        : `Une nouvelle livraison #${order.id} vous a ete attribuee.`
    );
    const [customerContact, driverContacts] = await Promise.all([
      getUserContact(order.user_id),
      getDriversAtLocation(order.location_id)
    ]);
    const assignedDriverContact = driverContacts.find(driver => Number(driver.id) === Number(driver_id));
    await Promise.all([
      sendSmsNotification(
        customerContact?.phone,
        reassignment
          ? `Point Chaud: le livreur de la commande #${order.id} a ete reaffecte.`
          : `Point Chaud: un livreur a ete affecte a la commande #${order.id}.`
      ),
      sendSmsNotification(
        assignedDriverContact?.phone,
        reassignment
          ? `Point Chaud: la livraison #${order.id} vous a ete reaffectee.`
          : `Point Chaud: une nouvelle livraison #${order.id} vous a ete attribuee.`
      )
    ]);

    const [updatedOrders] = await db.query(`${orderSelect} WHERE o.id = ?`, [req.params.id]);
    const updatedOrder = await mapOrder(updatedOrders[0]);

    res.json({
      message: reassignment ? "Livreur reaffecte avec succes" : "Livreur assigne avec succes",
      order: updatedOrder
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible d'assigner le livreur", error: error.message });
  }
};

exports.updateDeliveryStatus = async (req, res) => {
  const { delivery_status } = req.body;

  if (!["assigned", "out_for_delivery", "delivered"].includes(delivery_status)) {
    return res.status(400).json({ message: "Statut de livraison invalide" });
  }

  try {
    const actor = await getActor(req.user.id);
    const [orders] = await db.query("SELECT * FROM orders WHERE id = ?", [req.params.id]);
    if (!orders.length) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    const order = orders[0];
    if (order.order_type !== "delivery") {
      return res.status(400).json({ message: "Cette commande n'est pas une livraison" });
    }
    if (!["paid", "completed"].includes(order.status)) {
      return res.status(400).json({ message: "Cette commande n'est pas encore prete pour la livraison" });
    }

    if (actor.role === "driver" && Number(order.assigned_driver_id) !== Number(actor.id)) {
      return res.status(403).json({ message: "Cette livraison ne vous est pas attribuee" });
    }

    const nextStatus = delivery_status === "delivered" ? "completed" : order.status;
    const deliveredAt = delivery_status === "delivered" ? "NOW()" : "NULL";

    await db.query(
      `UPDATE orders
       SET delivery_status = ?, status = ?, delivered_at = ${deliveredAt}
       WHERE id = ?`,
      [delivery_status, nextStatus, req.params.id]
    );

    const messages = {
      assigned: `Votre commande #${order.id} est assignee a un livreur.`,
      out_for_delivery: `Votre commande #${order.id} est en route pour la livraison.`,
      delivered: `Votre commande #${order.id} a ete livree avec succes.`
    };

    await createNotificationForUser(order.user_id, messages[delivery_status]);
    const customerContact = await getUserContact(order.user_id);
    await sendSmsNotification(customerContact?.phone, `Point Chaud: ${messages[delivery_status]}`);

    const [updatedOrders] = await db.query(`${orderSelect} WHERE o.id = ?`, [req.params.id]);
    const updatedOrder = await mapOrder(updatedOrders[0]);

    res.json({ message: "Statut de livraison mis a jour", order: updatedOrder });
  } catch (error) {
    res.status(500).json({ message: "Impossible de mettre a jour la livraison", error: error.message });
  }
};
