const salesService = require("./sales.service");
const purchasesService = require("./purchases.service");
const partiesService = require("./parties.service");
const receiptService = require("./receipt.service");

const wrap = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        // A PDF may already be streaming; JSON can't follow that.
        if (res.headersSent) return res.end();
        return res.status(error.statusCode || 400).json({ success: false, message: error.message });
    }
};

const id = (req) => Number(req.params.id);
const actor = (req) => ({ createdBy: req.user.id });

// ---- items lookup + sales
exports.lookup = wrap(async (req, res) => {
    res.json({ success: true, data: await salesService.lookupItems(req.user.id, req.query) });
});

exports.createSale = wrap(async (req, res) => {
    const b = req.body;
    const result = await salesService.createSale(req.user.id, {
        lines: (b.lines || []).map((l) => ({ itemId: l.item_id, quantity: l.quantity, unitPrice: l.unit_price })),
        discount: b.discount, amountPaid: b.amount_paid, paymentMethod: b.payment_method, paidVia: b.paid_via,
        customerId: b.customer_id, customerName: b.customer_name, note: b.note, soldAt: b.sold_at,
        idempotencyKey: b.idempotency_key
    }, actor(req));
    res.status(result.replayed ? 200 : 201).json({
        success: true, message: result.replayed ? "Already recorded." : "Sale recorded.", data: result
    });
});

exports.listSales = wrap(async (req, res) => {
    res.json({ success: true, data: await salesService.listSales(req.user.id, req.query) });
});

exports.getSale = wrap(async (req, res) => {
    res.json({ success: true, data: await salesService.getSale(req.user.id, id(req)) });
});

exports.voidSale = wrap(async (req, res) => {
    res.json({ success: true, message: "Sale cancelled.", data: await salesService.voidSale(req.user.id, id(req), { reason: req.body.reason }, actor(req)) });
});

exports.returnSale = wrap(async (req, res) => {
    const b = req.body;
    const result = await salesService.returnSale(req.user.id, id(req), {
        lines: (b.lines || []).map((l) => ({ saleLineId: l.sale_line_id, quantity: l.quantity })),
        refundMethod: b.refund_method, reason: b.reason, idempotencyKey: b.idempotency_key
    }, actor(req));
    res.status(result.replayed ? 200 : 201).json({
        success: true, message: result.replayed ? "Already recorded." : "Return recorded.", data: result
    });
});

exports.getReceipt = wrap(async (req, res) => {
    res.json({ success: true, data: await receiptService.buildReceipt(req.user.id, id(req), req.query.lang) });
});

exports.receiptPdf = wrap(async (req, res) => {
    await receiptService.streamPdf(res, req.user.id, id(req), req.query.lang);
});

// ---- purchases
exports.createPurchase = wrap(async (req, res) => {
    const b = req.body;
    const result = await purchasesService.createPurchase(req.user.id, {
        lines: (b.lines || []).map((l) => ({ itemId: l.item_id, quantity: l.quantity, unitCost: l.unit_cost })),
        supplierId: b.supplier_id, supplierName: b.supplier_name, invoiceNo: b.invoice_no, amountPaid: b.amount_paid,
        paymentMethod: b.payment_method, purchasedAt: b.purchased_at, note: b.note, idempotencyKey: b.idempotency_key
    }, actor(req));
    res.status(result.replayed ? 200 : 201).json({
        success: true, message: result.replayed ? "Already recorded." : "Purchase recorded.", data: result
    });
});

exports.listPurchases = wrap(async (req, res) => {
    res.json({ success: true, data: await purchasesService.listPurchases(req.user.id, req.query) });
});

exports.getPurchase = wrap(async (req, res) => {
    res.json({ success: true, data: await purchasesService.getPurchase(req.user.id, id(req)) });
});

exports.payPurchase = wrap(async (req, res) => {
    const result = await purchasesService.payPurchase(req.user.id, id(req), {
        amount: req.body.amount, method: req.body.method, note: req.body.note, idempotencyKey: req.body.idempotency_key
    }, actor(req));
    res.status(result.replayed ? 200 : 201).json({ success: true, message: result.replayed ? "Already recorded." : "Payment recorded.", data: result });
});

// ---- customers and suppliers
exports.listCustomers = wrap(async (req, res) => {
    res.json({ success: true, data: await partiesService.list("customer", req.user.id, req.query) });
});
exports.createCustomer = wrap(async (req, res) => {
    res.status(201).json({ success: true, message: "Customer added.", data: await partiesService.create("customer", req.user.id, req.body) });
});
exports.updateCustomer = wrap(async (req, res) => {
    const b = req.body;
    res.json({ success: true, data: await partiesService.update("customer", req.user.id, id(req), { name: b.name, phone: b.phone, note: b.note, isArchived: b.is_archived }) });
});
exports.getCustomer = wrap(async (req, res) => {
    res.json({ success: true, data: await partiesService.customerStatement(req.user.id, id(req)) });
});
exports.customerPayment = wrap(async (req, res) => {
    const result = await partiesService.receiveCustomerPayment(req.user.id, id(req), {
        amount: req.body.amount, method: req.body.method, note: req.body.note, idempotencyKey: req.body.idempotency_key
    }, actor(req));
    res.status(result.replayed ? 200 : 201).json({ success: true, message: result.replayed ? "Already recorded." : "Payment recorded.", data: result });
});

exports.listSuppliers = wrap(async (req, res) => {
    res.json({ success: true, data: await partiesService.list("supplier", req.user.id, req.query) });
});
exports.createSupplier = wrap(async (req, res) => {
    res.status(201).json({ success: true, message: "Supplier added.", data: await partiesService.create("supplier", req.user.id, req.body) });
});
exports.updateSupplier = wrap(async (req, res) => {
    const b = req.body;
    res.json({ success: true, data: await partiesService.update("supplier", req.user.id, id(req), { name: b.name, phone: b.phone, note: b.note, isArchived: b.is_archived }) });
});
exports.getSupplier = wrap(async (req, res) => {
    res.json({ success: true, data: await purchasesService.supplierStatement(req.user.id, id(req)) });
});
