const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const requireApprovedDeliveryAgent = require("../../middleware/requireApprovedDeliveryAgent.middleware");
const requireDeliveryBusiness = require("./deliveryBusiness.middleware");
const controller = require("./deliveryBusiness.controller");
const v = require("./deliveryBusiness.validator");

// A delivery business is owned by an approved delivery_agent account.
router.use(authMiddleware, authorize("delivery_agent"), requireApprovedDeliveryAgent);

// Available before a business exists (these are how you find out / create one).
router.get("/me", controller.getMine);
router.post("/", v.registerValidation, validationMiddleware, controller.register);

// Everything below needs the caller to own a business (req.business).
router.use(requireDeliveryBusiness);

router.get("/overview", v.overviewValidation, validationMiddleware, controller.getOverview);

router.get("/roster", controller.getRoster);
router.post("/roster", v.addAgentValidation, validationMiddleware, controller.addAgent);
router.delete("/roster/:agentId", v.agentIdValidation, validationMiddleware, controller.removeAgent);

router.get("/jobs", v.listJobsValidation, validationMiddleware, controller.listJobs);
router.post("/jobs", v.createJobValidation, validationMiddleware, controller.createJob);
router.put("/jobs/:jobId/assign", v.assignValidation, validationMiddleware, controller.assignJob);
router.put("/jobs/:jobId/status", v.statusValidation, validationMiddleware, controller.updateJobStatus);
router.put("/jobs/:jobId/fee", v.feeValidation, validationMiddleware, controller.updateJobFee);

module.exports = router;
