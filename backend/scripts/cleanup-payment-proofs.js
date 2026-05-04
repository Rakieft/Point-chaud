require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { runPaymentProofCleanup } = require("../services/payment-proof-cleanup.service");

(async () => {
  try {
    const result = await runPaymentProofCleanup({ trigger: "script" });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("Impossible de nettoyer les preuves de paiement:", error.message);
    process.exit(1);
  }
})();
