const salesService = require("./sales.service");
const expensesService = require("./expenses.service");
const reports = require("./reports.service");
const importExport = require("./importExport.service");
const requireFeature = require("../../middleware/requireFeature.middleware");

const wrap = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        if (res.headersSent) return res.end();
        const body = { success: false, message: error.message };
        if (error.code === "FEATURE_NOT_IN_PLAN") body.code = error.code;
        return res.status(error.statusCode || 400).json(body);
    }
};

const actor = (req) => ({ createdBy: req.user.id });
const access = (req) => req.stockAccess;
const ok = (res, data) => res.json({ success: true, data });

// What the signed-in seller's plan allows right now (the screens use it to hide or lock things,
// and to show the read-only banner after a plan lapses).
exports.getAccess = wrap(async (req, res) => {
    const a = await requireFeature.resolveAccess(req.user.id);
    ok(res, {
        mode: a.mode, reason: a.reason, plan_code: a.planCode, features: a.features,
        read_only: a.mode === "read_only", grace_ends_in_days: a.graceEndsInDays ?? null
    });
});

exports.syncSales = wrap(async (req, res) => {
    const sales = (req.body.sales || []).map((b) => ({
        lines: (b.lines || []).map((l) => ({ itemId: l.item_id, quantity: l.quantity, unitPrice: l.unit_price })),
        discount: b.discount, amountPaid: b.amount_paid, paymentMethod: b.payment_method, paidVia: b.paid_via,
        customerId: b.customer_id, customerName: b.customer_name, note: b.note, soldAt: b.sold_at,
        idempotencyKey: b.idempotency_key
    }));
    ok(res, { results: await salesService.syncOffline(req.user.id, sales, actor(req)) });
});

// ---- expenses
exports.createExpense = wrap(async (req, res) => {
    const b = req.body;
    const result = await expensesService.create(req.user.id, {
        category: b.category, amount: b.amount, expenseDate: b.expense_date, note: b.note, idempotencyKey: b.idempotency_key
    }, { ...actor(req), file: req.file });
    res.status(result.replayed ? 200 : 201).json({ success: true, message: result.replayed ? "Already recorded." : "Expense recorded.", data: result });
});
exports.listExpenses = wrap(async (req, res) => ok(res, { ...(await expensesService.list(req.user.id, req.query)), categories: expensesService.CATEGORIES }));
exports.getExpense = wrap(async (req, res) => ok(res, await expensesService.get(req.user.id, Number(req.params.id))));
exports.voidExpense = wrap(async (req, res) =>
    res.json({ success: true, message: "Expense cancelled.", data: await expensesService.void(req.user.id, Number(req.params.id), { reason: req.body.reason }, actor(req)) }));

// ---- reports
exports.overview = wrap(async (req, res) => ok(res, await reports.overview(req.user.id, req.query, access(req))));
exports.bestSellers = wrap(async (req, res) => ok(res, await reports.bestSellers(req.user.id, req.query, access(req))));
exports.valuation = wrap(async (req, res) => ok(res, await reports.valuation(req.user.id, req.query, access(req))));
exports.lowStock = wrap(async (req, res) => ok(res, await reports.lowStock(req.user.id, req.query)));
exports.dailyClose = wrap(async (req, res) => ok(res, await reports.dailyClose(req.user.id, req.query)));
exports.debts = wrap(async (req, res) => ok(res, await reports.debts(req.user.id)));

// ---- import / export
const sendCsv = (res, { filename, csv }) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(csv);
};
exports.template = wrap(async (req, res) => sendCsv(res, importExport.template(req.query.lang)));
exports.importItems = wrap(async (req, res) => {
    const dry = req.body.dry_run === "1" || req.body.dry_run === "true" || req.body.dry_run === true;
    const data = dry
        ? await importExport.previewItems(req.user.id, req.file, access(req))
        : await importExport.applyItems(req.user.id, req.file, { ...actor(req), idempotencyKey: req.body.idempotency_key, access: access(req) });
    ok(res, data);
});
exports.exportCsv = wrap(async (req, res) =>
    sendCsv(res, await importExport.exportCsv(req.user.id, req.params.kind, req.query, access(req), { actor: req.user.id })));
