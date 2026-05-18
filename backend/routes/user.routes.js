const express = require("express");
const userController = require("../controllers/user.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

const router = express.Router();

router.get("/me", auth, userController.getMyProfile);
router.patch("/me", auth, userController.updateMyProfile);

router.get("/dashboard", auth, role("manager", "admin"), userController.getDashboardStats);
router.get("/staff", auth, role("admin"), userController.getStaff);
router.patch("/staff/:id", auth, role("admin"), userController.updateStaffMember);
router.delete("/staff/:id", auth, role("admin"), userController.deactivateStaffMember);
router.get("/reports", auth, role("manager", "admin"), userController.getReports);
router.get("/proof-maintenance", auth, role("admin"), userController.getPaymentProofMaintenance);
router.post("/proof-maintenance/run", auth, role("admin"), userController.runPaymentProofMaintenance);
router.get("/drivers", auth, role("manager", "admin"), userController.getDrivers);
router.get("/analytics", auth, role("admin"), userController.getAnalyticsOverview);
router.get("/security-events", auth, role("admin"), userController.getSecurityEvents);

module.exports = router;
