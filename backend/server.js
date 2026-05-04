const app = require("./app");
const { startPaymentProofCleanupScheduler } = require("./services/payment-proof-cleanup.service");

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  startPaymentProofCleanupScheduler();
  console.log(`Server running on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down Point Chaud server...`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
