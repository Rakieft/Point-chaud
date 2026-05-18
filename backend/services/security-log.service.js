const db = require("../config/db");

async function logSecurityEvent({
  eventType,
  severity = "info",
  userId = null,
  email = null,
  ipAddress = null,
  details = null
}) {
  if (!eventType) return;

  try {
    await db.query(
      `
        INSERT INTO security_events
        (event_type, severity, user_id, email, ip_address, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [eventType, severity, userId, email, ipAddress, details ? JSON.stringify(details) : null]
    );
  } catch (error) {
    console.warn("[SECURITY LOG] Impossible d'enregistrer l'evenement :", error.message);
  }
}

module.exports = {
  logSecurityEvent
};
