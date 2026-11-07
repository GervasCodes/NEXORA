const express = require("express");
const router = express.Router();

const validationMiddleware = require("../../middleware/validation.middleware");
const ctrl = require("./trade.controller");
const v = require("./trade.validator");

// Sales, purchases, customers, suppliers (Phase 7). Mounted inside stock.routes.js,
// AFTER its router.use(auth, seller role, business-tools access, plan gate), so
// every route here is already authenticated and plan-gated; each service call is
// additionally scoped to req.user.id.

router.get("/lookup", v.lookupValidation, validationMiddleware, ctrl.lookup);

router.get("/sales", v.listSalesValidation, validationMiddleware, ctrl.listSales);
router.post("/sales", v.createSaleValidation, validationMiddleware, ctrl.createSale);
router.get("/sales/:id", v.idValidation, validationMiddleware, ctrl.getSale);
router.post("/sales/:id/void", v.voidSaleValidation, validationMiddleware, ctrl.voidSale);
router.post("/sales/:id/return", v.returnSaleValidation, validationMiddleware, ctrl.returnSale);
router.get("/sales/:id/receipt", v.receiptValidation, validationMiddleware, ctrl.getReceipt);
router.get("/sales/:id/receipt.pdf", v.receiptValidation, validationMiddleware, ctrl.receiptPdf);

router.get("/purchases", v.listPurchasesValidation, validationMiddleware, ctrl.listPurchases);
router.post("/purchases", v.createPurchaseValidation, validationMiddleware, ctrl.createPurchase);
router.get("/purchases/:id", v.idValidation, validationMiddleware, ctrl.getPurchase);
router.post("/purchases/:id/payments", v.paymentValidation, validationMiddleware, ctrl.payPurchase);

router.get("/customers", v.listPartiesValidation, validationMiddleware, ctrl.listCustomers);
router.post("/customers", v.createPartyValidation, validationMiddleware, ctrl.createCustomer);
router.get("/customers/:id", v.idValidation, validationMiddleware, ctrl.getCustomer);
router.put("/customers/:id", v.updatePartyValidation, validationMiddleware, ctrl.updateCustomer);
router.post("/customers/:id/payments", v.paymentValidation, validationMiddleware, ctrl.customerPayment);

router.get("/suppliers", v.listPartiesValidation, validationMiddleware, ctrl.listSuppliers);
router.post("/suppliers", v.createPartyValidation, validationMiddleware, ctrl.createSupplier);
router.get("/suppliers/:id", v.idValidation, validationMiddleware, ctrl.getSupplier);
router.put("/suppliers/:id", v.updatePartyValidation, validationMiddleware, ctrl.updateSupplier);

module.exports = router;
