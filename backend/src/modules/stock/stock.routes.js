const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/authorize.middleware");
const validationMiddleware = require("../../middleware/validation.middleware");
const requireFeature = require("../../middleware/requireFeature.middleware");
const { requireBusinessToolsAccess } = require("../businessTools/businessTools.middleware");
const requireApprovedSeller = require("../../middleware/requireApprovedSeller.middleware");
const ctrl = require("./stock.controller");
const v = require("./stock.validator");

// Nexora Stock Management (Phase 6). Same access rules as the classic POS:
// a seller account (marketplace sellers once approved, or a tools-only account)
// whose plan includes stock_pos (Phase 8: plan entitlements, with a read-only
// export mode after a plan lapses - see middleware/requireFeature.middleware.js). Every query is scoped to req.user.id in the service.
router.use(authMiddleware, authorize("seller"), requireBusinessToolsAccess, requireFeature("stock_pos"));

router.get("/items", v.listItemsValidation, validationMiddleware, ctrl.listItems);
router.post("/items", v.createItemValidation, validationMiddleware, ctrl.createItem);
router.get("/items/:id", v.itemIdValidation, validationMiddleware, ctrl.getItem);
router.put("/items/:id", v.updateItemValidation, validationMiddleware, ctrl.updateItem);
router.post("/items/:id/archive", v.itemIdValidation, validationMiddleware, ctrl.archive);
router.post("/items/:id/unarchive", v.itemIdValidation, validationMiddleware, ctrl.unarchive);
router.post("/items/:id/stock", v.adjustValidation, validationMiddleware, ctrl.adjust);

// Selling on Nexora needs a marketplace seller account.
const marketplaceOnly = (req, res, next) => {
    if (req.sellerMode === "business_tools") {
        return res.status(403).json({ success: false, message: "Convert to a marketplace seller account to list items on Nexora." });
    }
    return next();
};
router.post("/items/:id/list-on-nexora", marketplaceOnly, requireApprovedSeller, v.listOnNexoraValidation, validationMiddleware, ctrl.listOnNexora);
router.post("/items/:id/unlink", marketplaceOnly, v.itemIdValidation, validationMiddleware, ctrl.unlink);

router.get("/movements", v.listMovementsValidation, validationMiddleware, ctrl.listMovements);
router.get("/reconcile", ctrl.reconcile);

// Phase 7: sales, purchases, customers, suppliers, receipts (same gate as above).
router.use(require("./trade.routes"));

// Phase 8: expenses, reports, import / export, offline sync, plan access.
router.use(require("./ops.routes"));

module.exports = router;
