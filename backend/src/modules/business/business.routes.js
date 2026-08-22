const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");

const businessController = require("./business.controller");
const {
    applyValidation,
    verifyValidation,
    productIdValidation,
    setTiersValidation
} = require("./business.validator");

// --- Public: bulk tiers for a product (a buyer needs to see these
// before checkout, whether or not they're a verified business account -
// see business.service.js's header comment) ---
router.get("/products/:productId/tiers", productIdValidation, validationMiddleware, businessController.getTiers);

router.use(authMiddleware);

// --- Admin ---
router.get("/admin/pending", authorize("admin"), businessController.listPending);
router.put("/admin/:userId/verify", authorize("admin"), verifyValidation, validationMiddleware, businessController.verify);

// --- Buyer: business account application ---
router.get("/me", authorize("buyer"), businessController.getMyStatus);
router.post("/apply", authorize("buyer"), applyValidation, validationMiddleware, businessController.apply);

// --- Seller: manage bulk pricing on their own products ---
router.put(
    "/products/:productId/tiers",
    authorize("seller"),
    setTiersValidation,
    validationMiddleware,
    businessController.setTiers
);

module.exports = router;
