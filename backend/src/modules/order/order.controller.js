const orderService = require("./order.service");
const orderInvoiceService = require("./orderInvoice.service");

exports.downloadInvoice = async (req, res) => {
    try {
        // streamInvoice re-fetches the order via getOrderDetail, which
        // already throws "Order not found" for an order that isn't this
        // buyer's - same ownership check every other order-detail read
        // in this file relies on, not a separate check here.
        await orderInvoiceService.streamInvoice(res, req.params.id, req.user.id);
    } catch (error) {
        // A PDF response can't carry a JSON error body once headers are
        // already sent (pdfkit may have started streaming) - only send
        // the JSON error if nothing has gone out yet.
        if (!res.headersSent) {
            res.status(400).json({ success: false, message: error.message });
        } else {
            res.end();
        }
    }
};

exports.checkout = async (req, res) => {
    try {
        const result = await orderService.checkout(req.user.id, req.body);

        return res.status(201).json({
            success: true,
            message: "Order placed successfully",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Phase 6 (Checkout & Order Timeline UX): pre-payment delivery-time
// estimate for the buyer's current cart + the pin they've dropped on
// Checkout.jsx. Read-only, no order is created here.
exports.getDeliveryEstimate = async (req, res) => {
    try {
        const estimate = await orderService.getDeliveryEstimate(req.user.id, {
            deliveryLat: req.body.delivery_lat,
            deliveryLng: req.body.delivery_lng
        });

        return res.json({
            success: true,
            data: estimate
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getMyOrders = async (req, res) => {
    try {
        const orders = await orderService.getMyOrders(req.user.id, req.query);

        return res.json({
            success: true,
            data: orders
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getOrderDetail = async (req, res) => {
    try {
        const order = await orderService.getOrderDetail(
            req.params.id,
            req.user.id
        );

        return res.json({
            success: true,
            data: order
        });

    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

exports.cancelOrder = async (req, res) => {
    try {
        await orderService.cancelOrder(req.params.id, req.user.id);

        return res.json({
            success: true,
            message: "Order cancelled"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getSellerOrders = async (req, res) => {
    try {
        const orders = await orderService.getSellerOrders(req.user.id, req.query);

        return res.json({
            success: true,
            data: orders
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getSellerOrderDetail = async (req, res) => {
    try {
        const order = await orderService.getSellerOrderDetail(req.params.id, req.user.id);

        return res.json({
            success: true,
            data: order
        });

    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

exports.updateOrderStatus = async (req, res) => {
    try {
        await orderService.updateOrderStatusBySeller(
            req.params.id,
            req.user.id,
            req.body.status,
            req.body.agent_id
        );

        return res.json({
            success: true,
            message: "Order status updated"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
