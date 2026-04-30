const express = require("express");
const productController = require("../controllers/product.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

const router = express.Router();

router.get("/", productController.getCatalog);
router.post("/categories", auth, role("admin"), productController.createCategory);
router.post("/", auth, role("admin"), productController.createProduct);
router.patch("/:id", auth, role("admin"), productController.updateProduct);
router.delete("/:id", auth, role("admin"), productController.deleteProduct);

module.exports = router;
