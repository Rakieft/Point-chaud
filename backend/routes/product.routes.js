const express = require("express");
const productController = require("../controllers/product.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

const router = express.Router();

router.get("/", productController.getCatalog);
router.post("/", auth, role("admin"), productController.createProduct);

module.exports = router;
