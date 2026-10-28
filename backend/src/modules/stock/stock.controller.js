const stockService = require("./stock.service");

const sendError = (res, error) => {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
};

const wrap = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        sendError(res, error);
    }
};

const itemData = (b) => ({
    name: b.name, sku: b.sku, barcode: b.barcode, unit: b.unit,
    costPrice: b.cost_price, sellPrice: b.sell_price, reorderLevel: b.reorder_level
});

exports.listItems = wrap(async (req, res) => {
    res.json({ success: true, data: await stockService.listItems(req.user.id, req.query) });
});

exports.getItem = wrap(async (req, res) => {
    res.json({ success: true, data: await stockService.getItem(req.user.id, Number(req.params.id)) });
});

exports.createItem = wrap(async (req, res) => {
    const item = await stockService.createItem(req.user.id, {
        ...itemData(req.body), openingStock: req.body.opening_stock, idempotencyKey: req.body.idempotency_key
    });
    res.status(201).json({ success: true, message: "Item added.", data: item });
});

exports.updateItem = wrap(async (req, res) => {
    const item = await stockService.updateItem(req.user.id, Number(req.params.id), itemData(req.body));
    res.json({ success: true, message: "Item updated.", data: item });
});

exports.archive = wrap(async (req, res) => {
    res.json({ success: true, data: await stockService.setArchived(req.user.id, Number(req.params.id), true) });
});

exports.unarchive = wrap(async (req, res) => {
    res.json({ success: true, data: await stockService.setArchived(req.user.id, Number(req.params.id), false) });
});

exports.adjust = wrap(async (req, res) => {
    const result = await stockService.adjust(req.user.id, Number(req.params.id), {
        type: req.body.type, quantity: req.body.quantity, newStock: req.body.new_stock,
        baseline: req.body.baseline, unitCost: req.body.unit_cost, reason: req.body.reason,
        idempotencyKey: req.body.idempotency_key
    }, { createdBy: req.user.id });
    res.status(result.replayed ? 200 : 201).json({
        success: true, message: result.replayed ? "Already recorded." : "Stock updated.", data: result
    });
});

exports.listOnNexora = wrap(async (req, res) => {
    const data = await stockService.listOnNexora(req.user.id, Number(req.params.id), {
        categoryId: req.body.category_id ? Number(req.body.category_id) : null
    });
    res.status(201).json({ success: true, message: "Draft listing created.", data });
});

exports.unlink = wrap(async (req, res) => {
    res.json({ success: true, message: "Item unlinked from Nexora.", data: await stockService.unlink(req.user.id, Number(req.params.id)) });
});

exports.listMovements = wrap(async (req, res) => {
    res.json({ success: true, data: await stockService.listMovements(req.user.id, req.query) });
});

exports.reconcile = wrap(async (req, res) => {
    res.json({ success: true, data: await stockService.reconcile(req.user.id) });
});
