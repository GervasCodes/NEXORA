const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const { requireBusinessToolsAccess, requireToolsOnlyAccount } = require("../businessTools/businessTools.middleware");
const requireSubscriptionTier = require("../../middleware/requireSubscriptionTier.middleware");
const posController = require("./pos.controller");
const {
    adjustmentValidation,
    saleValidation,
    listAdjustmentsValidation,
    listSalesValidation,
    stockLevelsValidation,
    reportValidation,
    createItemValidation,
    updateItemValidation
} = require("./pos.validator");

// Whole module is a paid-tier feature: Free sellers can still sell on the
// marketplace, but business tooling needs a paid plan - same gate stack
// as Analytics (seller.routes.js) and the AI advisory endpoints.
// Open to marketplace sellers (approved, as before) and to business-tools-only
// accounts (no marketplace review). The tools tier is a paid plan, so
// requireSubscriptionTier applies to both.
router.use(authMiddleware, authorize("seller"), requireBusinessToolsAccess, requireSubscriptionTier);

router.get("/stock", stockLevelsValidation, validationMiddleware, posController.getStockLevels);
router.get("/report", reportValidation, validationMiddleware, posController.getReport);

// Inventory items for tools-only accounts (hidden products, never listed publicly).
router.post("/items", requireToolsOnlyAccount, createItemValidation, validationMiddleware, posController.createItem);
router.put("/items/:productId", requireToolsOnlyAccount, updateItemValidation, validationMiddleware, posController.updateItem);

router.get("/adjustments", listAdjustmentsValidation, validationMiddleware, posController.listAdjustments);
router.post("/adjustments", adjustmentValidation, validationMiddleware, posController.adjustStock);

router.get("/sales", listSalesValidation, validationMiddleware, posController.listSales);
router.post("/sales", saleValidation, validationMiddleware, posController.recordSale);

module.exports = router;
