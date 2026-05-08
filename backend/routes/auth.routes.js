const express = require("express");
const authController = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

const router = express.Router();

router.get("/social-config", authController.socialConfig);
router.post("/register", authController.register);
router.post("/verify-email", authController.verifyEmail);
router.post("/resend-verification", authController.resendVerificationEmail);
router.post("/social-login", authController.socialLogin);
router.post("/staff", auth, role("admin"), authController.createStaff);
router.post("/login", authController.login);
router.get("/me", auth, authController.me);

module.exports = router;
