const express = require("express");
const userController = require("../controllers/user.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

const router = express.Router();

router.get("/dashboard", auth, role("manager", "admin"), userController.getDashboardStats);

module.exports = router;
