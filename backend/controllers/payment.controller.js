const crypto = require("crypto");
const db = require("../config/db");
const { createNotificationForRole, createNotificationForUser } = require("../utils/helpers");
const { generateQrPayload } = require("../services/qr.service");

exports.submitPaymentProof = async (req, res) => {
  const { payment_method, transaction_reference } = req.body;

  if (!payment_method || !transaction_reference) {
    return res.status(400).json({ message: "Methode et reference de paiement sont obligatoires" });
  }

  if (!req.file) {
    return res.status(400).json({ message: "La preuve de paiement est obligatoire" });
  }

  try {
    const [orders] = await db.query("SELECT * FROM orders WHERE id = ? AND user_id = ?", [
      req.params.orderId,
      req.user.id
    ]);

    if (!orders.length) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    const order = orders[0];

    if (order.status !== "awaiting_payment") {
      return res.status(400).json({ message: "Cette commande n'attend pas de paiement" });
    }

    await db.query(
      `UPDATE orders
       SET payment_method = ?,
           payment_status = 'pending',
           payment_proof = ?,
           transaction_reference = ?
       WHERE id = ?`,
      [payment_method, req.file.filename, transaction_reference, req.params.orderId]
    );

    await createNotificationForRole(
      "manager",
      `Une preuve de paiement a ete soumise pour la commande #${req.params.orderId}.`
    );

    res.json({ message: "Preuve de paiement envoyee" });
  } catch (error) {
    res.status(500).json({ message: "Impossible d'envoyer la preuve", error: error.message });
  }
};

exports.confirmPayment = async (req, res) => {
  const { action } = req.body;

  if (!["confirm", "reject"].includes(action)) {
    return res.status(400).json({ message: "Action invalide" });
  }

  try {
    const [orders] = await db.query("SELECT * FROM orders WHERE id = ?", [req.params.orderId]);

    if (!orders.length) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    const order = orders[0];

    if (!order.payment_proof) {
      return res.status(400).json({ message: "Aucune preuve de paiement n'a ete envoyee" });
    }

    if (action === "confirm") {
      const qrToken = crypto.randomUUID();
      await db.query(
        `UPDATE orders
         SET payment_status = 'confirmed',
             status = 'paid',
             confirmed_by = ?,
             confirmed_at = NOW(),
             qr_code_token = ?
         WHERE id = ?`,
        [req.user.id, qrToken, req.params.orderId]
      );

      await createNotificationForUser(
        order.user_id,
        `Paiement confirme pour la commande #${req.params.orderId}. Votre QR code est disponible.`
      );

      const qrCode = await generateQrPayload(qrToken, Number(req.params.orderId));

      return res.json({
        message: "Paiement confirme",
        qrCode
      });
    }

    await db.query(
      `UPDATE orders
       SET payment_status = 'rejected',
           status = 'awaiting_payment',
           confirmed_by = ?,
           confirmed_at = NOW(),
           qr_code_token = NULL
       WHERE id = ?`,
      [req.user.id, req.params.orderId]
    );

    await createNotificationForUser(
      order.user_id,
      `Le paiement de la commande #${req.params.orderId} a ete rejete. Veuillez soumettre une nouvelle preuve.`
    );

    res.json({ message: "Paiement rejete" });
  } catch (error) {
    res.status(500).json({ message: "Impossible de traiter le paiement", error: error.message });
  }
};
