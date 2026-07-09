const orderService = require("./order.service");

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

exports.getMyOrders = async (req, res) => {
    try {
        const orders = await orderService.getMyOrders(req.user.id);

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
        const orders = await orderService.getSellerOrders(req.user.id);

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
