const express = require("express");
const authController = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const { createRateLimiter } = require("../middlewares/rate-limit.middleware");

const router = express.Router();

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxHits: 5,
  blockMs: 30 * 60 * 1000,
  keyFactory: req => `${req.ip}:${req.body?.email || ""}`,
  message: "Trop de tentatives de connexion. Reessaie dans 30 minutes."
});

const passwordRecoveryLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxHits: 5,
  blockMs: 30 * 60 * 1000,
  keyFactory: req => `${req.ip}:${req.body?.email || ""}`,
  message: "Trop de demandes sensibles. Reessaie dans 30 minutes."
});

const tokenActionLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxHits: 10,
  blockMs: 30 * 60 * 1000,
  keyFactory: req => `${req.ip}:${req.body?.token || req.query?.token || ""}`,
  message: "Trop de tentatives sur ce lien securise. Reessaie dans 30 minutes."
});

router.get("/social-config", authController.socialConfig);
router.post("/register", authController.register);
router.post("/verify-email", tokenActionLimiter, authController.verifyEmail);
router.post("/resend-verification", passwordRecoveryLimiter, authController.resendVerificationEmail);
router.post("/forgot-password", passwordRecoveryLimiter, authController.forgotPassword);
router.post("/validate-reset-password", tokenActionLimiter, authController.validatePasswordResetToken);
router.post("/reset-password", tokenActionLimiter, authController.resetPassword);
router.post("/social-login", authController.socialLogin);
router.post("/staff", auth, role("admin"), authController.createStaff);
router.post("/login", loginLimiter, authController.login);
router.get("/me", auth, authController.me);

module.exports = router;
