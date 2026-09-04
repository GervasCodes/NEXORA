const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const couponController = require("./coupon.controller");
const { validateCouponValidation } = require("./coupon.validator");

router.use(authMiddleware, authorize("buyer"));

router.post("/validate", validateCouponValidation, validationMiddleware, couponController.validate);

module.exports = router;
