const express = require("express");
const orderController = require("../controllers/order.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

const router = express.Router();

router.post("/", auth, role("client"), orderController.createOrder);
router.get("/my", auth, role("client"), orderController.getMyOrders);
router.get("/", auth, role("manager", "admin"), orderController.getAllOrders);
router.patch("/:id/validate", auth, role("manager", "admin"), orderController.validateOrder);
router.post("/scan/:token", auth, role("manager", "admin"), orderController.scanOrder);

module.exports = router;
