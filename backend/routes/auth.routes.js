const express = require("express");
const authController = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

const router = express.Router();

router.post("/register", authController.register);
router.post("/staff", auth, role("admin"), authController.createStaff);
router.post("/login", authController.login);
router.get("/me", auth, authController.me);

module.exports = router;
