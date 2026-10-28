const express = require("express");
const router = express.Router();

const validationMiddleware = require("../../middleware/validation.middleware");
const requireFeature = require("../../middleware/requireFeature.middleware");
const upload = require("../../middleware/upload.middleware");
const spreadsheetUpload = require("../../middleware/spreadsheetUpload.middleware");
const ctrl = require("./ops.controller");
const v = require("./ops.validator");

// Expenses, reports, import / export, offline sync, plan access (Phase 8). Mounted inside
// stock.routes.js AFTER its gate (auth, seller role, business-tools access, stock_pos), so
// every route here is authenticated and plan-checked; the feature checks below are in
// addition. In read-only mode (a lapsed plan inside the export grace period) the gate lets
// GET requests through and refuses everything else, so viewing, reports and exports keep
// working and nothing can be written.

router.get("/access", ctrl.getAccess);

router.post("/sales/sync", v.syncValidation, validationMiddleware, ctrl.syncSales);

router.get("/expenses", v.listExpensesValidation, validationMiddleware, ctrl.listExpenses);
router.post("/expenses", upload.single("receipt"), v.createExpenseValidation, validationMiddleware, ctrl.createExpense);
router.get("/expenses/:id", v.idValidation, validationMiddleware, ctrl.getExpense);
router.post("/expenses/:id/void", v.voidExpenseValidation, validationMiddleware, ctrl.voidExpense);

const reportsGate = requireFeature("stock_reports");
router.get("/reports/overview", reportsGate, v.rangeValidation, validationMiddleware, ctrl.overview);
router.get("/reports/best-sellers", reportsGate, v.rangeValidation, validationMiddleware, ctrl.bestSellers);
router.get("/reports/low-stock", reportsGate, ctrl.lowStock);
router.get("/reports/daily-close", reportsGate, v.dailyCloseValidation, validationMiddleware, ctrl.dailyClose);
router.get("/reports/debts", reportsGate, ctrl.debts);
// Cost / profit data: needs the stock_cost_reports feature (the service checks it too).
router.get("/reports/valuation", reportsGate, requireFeature("stock_cost_reports"), ctrl.valuation);

const ioGate = requireFeature("stock_import_export");
router.get("/import/template", ioGate, v.templateValidation, validationMiddleware, ctrl.template);
router.post("/import/items", ioGate, spreadsheetUpload.single("file"), ctrl.importItems);
router.get("/export/:kind", ioGate, v.exportValidation, validationMiddleware, ctrl.exportCsv);

module.exports = router;
