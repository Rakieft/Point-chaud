const app = require("./app");
const { startPaymentProofCleanupScheduler } = require("./services/payment-proof-cleanup.service");
const { startMonthlyAuditScheduler } = require("./services/monthly-audit-scheduler.service");

const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";

function isWeakJwtSecret(secret) {
  const value = String(secret || "").trim();
  if (!value) return true;

  const normalized = value.toLowerCase();
  const weakValues = new Set(["change_me", "changeme", "secret", "jwt_secret", "pointchaud", "admin123"]);

  return value.length < 24 || weakValues.has(normalized);
}

function validateSecurityConfig() {
  const secret = process.env.JWT_SECRET;

  if (isWeakJwtSecret(secret)) {
    const message =
      "JWT_SECRET est trop faible. Utilise une longue valeur aleatoire avant la vraie mise en ligne.";

    if (isProduction) {
      throw new Error(message);
    }

    console.warn(`[SECURITY WARNING] ${message}`);
  }

  if (isProduction && !String(process.env.CORS_ORIGINS || "").trim()) {
    throw new Error("CORS_ORIGINS doit etre defini avant une execution en production.");
  }
}

validateSecurityConfig();

const server = app.listen(PORT, () => {
  startPaymentProofCleanupScheduler();
  startMonthlyAuditScheduler();
  console.log(`Server running on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down Point Chaud server...`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
