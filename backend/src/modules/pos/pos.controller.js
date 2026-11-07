const posService = require("./pos.service");

const sendError = (res, error) => {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
};

exports.adjustStock = async (req, res) => {
    try {
        const result = await posService.adjustStock(req.user.id, {
            productId: Number(req.body.product_id),
            variantId: req.body.variant_id ? Number(req.body.variant_id) : null,
            type: req.body.type,
            quantity: req.body.quantity,
            newStock: req.body.new_stock,
            reason: req.body.reason,
            idempotencyKey: req.body.idempotency_key
        });
        res.status(result.replayed ? 200 : 201).json({
            success: true,
            message: result.replayed ? "Already recorded." : "Stock updated.",
            data: result
        });
    } catch (error) {
        sendError(res, error);
    }
};

exports.recordSale = async (req, res) => {
    try {
        const result = await posService.recordSale(req.user.id, {
            productId: Number(req.body.product_id),
            variantId: req.body.variant_id ? Number(req.body.variant_id) : null,
            quantity: req.body.quantity,
            unitPrice: req.body.unit_price,
            paymentMethod: req.body.payment_method,
            customerName: req.body.customer_name,
            note: req.body.note,
            soldAt: req.body.sold_at,
            idempotencyKey: req.body.idempotency_key
        });
        res.status(result.replayed ? 200 : 201).json({
            success: true,
            message: result.replayed ? "Already recorded." : "Sale recorded.",
            data: result
        });
    } catch (error) {
        sendError(res, error);
    }
};

exports.listAdjustments = async (req, res) => {
    try {
        res.json({ success: true, data: await posService.listAdjustments(req.user.id, req.query) });
    } catch (error) {
        sendError(res, error);
    }
};

exports.listSales = async (req, res) => {
    try {
        res.json({ success: true, data: await posService.listSales(req.user.id, req.query) });
    } catch (error) {
        sendError(res, error);
    }
};

exports.getStockLevels = async (req, res) => {
    try {
        res.json({ success: true, data: await posService.getStockLevels(req.user.id, req.query) });
    } catch (error) {
        sendError(res, error);
    }
};

exports.getReport = async (req, res) => {
    try {
        res.json({ success: true, data: await posService.getReport(req.user.id, req.query) });
    } catch (error) {
        sendError(res, error);
    }
};

exports.createItem = async (req, res) => {
    try {
        const result = await posService.createItem(req.user.id, {
            name: req.body.name,
            price: req.body.price,
            initialStock: req.body.initial_stock
        });
        res.status(201).json({ success: true, message: "Item added.", data: result });
    } catch (error) {
        sendError(res, error);
    }
};

exports.updateItem = async (req, res) => {
    try {
        const item = await posService.updateItem(req.user.id, Number(req.params.productId), {
            name: req.body.name,
            price: req.body.price
        });
        res.json({ success: true, message: "Item updated.", data: item });
    } catch (error) {
        sendError(res, error);
    }
};
