const express = require("express");
const notificationController = require("../controllers/notification.controller");
const auth = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", auth, notificationController.getMyNotifications);
router.patch("/:id/read", auth, notificationController.markAsRead);

module.exports = router;
