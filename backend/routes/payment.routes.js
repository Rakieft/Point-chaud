const express = require("express");
const paymentController = require("../controllers/payment.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload.middleware");

const router = express.Router();

router.post(
  "/:orderId/proof",
  auth,
  role("client"),
  upload.single("proof"),
  paymentController.submitPaymentProof
);

router.patch(
  "/:orderId/confirm",
  auth,
  role("manager", "admin"),
  paymentController.confirmPayment
);

module.exports = router;
