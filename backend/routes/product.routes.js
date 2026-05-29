const express = require("express");
const productController = require("../controllers/product.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const imageUpload = require("../middlewares/image-upload.middleware");

const router = express.Router();

router.get("/", productController.getCatalog);
router.get("/marketing", productController.getMarketingContent);
router.get("/marketing/admin", auth, role("admin", "manager"), productController.getMarketingAdmin);
router.post("/upload-image", auth, role("admin"), imageUpload.single("image"), productController.uploadAdminImage);
router.put("/marketing/current", auth, role("admin"), productController.saveCurrentPromotion);
router.post("/marketing/upcoming", auth, role("admin"), productController.createUpcomingPromotion);
router.patch("/marketing/upcoming/:id", auth, role("admin"), productController.updateUpcomingPromotion);
router.delete("/marketing/upcoming/:id", auth, role("admin"), productController.deleteUpcomingPromotion);
router.put("/marketing/daily-specials", auth, role("admin"), productController.saveDailySpecials);
router.post("/categories", auth, role("admin"), productController.createCategory);
router.patch("/categories/:id", auth, role("admin"), productController.updateCategory);
router.delete("/categories/:id", auth, role("admin"), productController.deleteCategory);
router.post("/", auth, role("admin"), productController.createProduct);
router.patch("/:id", auth, role("admin"), productController.updateProduct);
router.delete("/:id", auth, role("admin"), productController.deleteProduct);

module.exports = router;
