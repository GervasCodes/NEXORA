const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const controller = require("./accountVerification.controller");
const { userIdValidation, rejectValidation } = require("./accountVerification.validator");

// Centralized seller/delivery-agent account verification review - the
// documents submitted at registration (owner photo, National/Voter ID,
// driver's license for delivery agents). Distinct from the seller
// module's separate paid "Verified Seller" badge review.
router.use(authMiddleware, authorize("admin"));

router.get("/", controller.list);
router.get("/:id", userIdValidation, validationMiddleware, controller.getDetail);
router.put("/:id/approve", userIdValidation, validationMiddleware, controller.approve);
router.put("/:id/reject", rejectValidation, validationMiddleware, controller.reject);

module.exports = router;
