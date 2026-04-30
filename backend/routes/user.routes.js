const express = require("express");
const userController = require("../controllers/user.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

const router = express.Router();

router.get("/dashboard", auth, role("manager", "admin"), userController.getDashboardStats);
router.get("/me", auth, role("client", "manager", "admin", "driver"), userController.getMyProfile);
router.patch("/me", auth, role("client", "manager", "admin", "driver"), userController.updateMyProfile);
router.get("/staff", auth, role("admin"), userController.getStaff);
router.get("/analytics", auth, role("admin"), userController.getAnalyticsOverview);
router.get("/drivers", auth, role("driver", "manager", "admin"), userController.getDrivers);
router.patch("/staff/:id", auth, role("admin"), userController.updateStaffMember);
router.delete("/staff/:id", auth, role("admin"), userController.deactivateStaffMember);
router.get("/reports", auth, role("manager", "admin"), userController.getReports);

module.exports = router;
