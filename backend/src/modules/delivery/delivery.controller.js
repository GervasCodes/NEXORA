const deliveryService = require("./delivery.service");

exports.getAvailableForPickup = async (req, res) => {
    try {
        const orders = await deliveryService.getAvailableForPickup();

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

exports.claimDelivery = async (req, res) => {
    try {
        const result = await deliveryService.claimDelivery(
            req.params.orderId,
            req.user.id
        );

        return res.status(201).json({
            success: true,
            message: "Delivery claimed",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getMyDeliveries = async (req, res) => {
    try {
        const deliveries = await deliveryService.getMyDeliveries(req.user.id);

        return res.json({
            success: true,
            data: deliveries
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getDelivery = async (req, res) => {
    try {
        const delivery = await deliveryService.getDelivery(
            req.params.orderId,
            req.user.id
        );

        return res.json({
            success: true,
            data: delivery
        });

    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

// Fallback for clients not using the socket for this (e.g. first load,
// or a client-side check before opening the socket connection).
exports.setOnlineStatus = async (req, res) => {
    try {
        const { isOnline } = req.body;
        await deliveryService.setAgentOnline(req.user.id, !!isOnline);

        return res.json({ success: true, message: `Marked ${isOnline ? "online" : "offline"}` });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateDeliveryStatus = async (req, res) => {
    try {
        const { status, notes } = req.body;

        await deliveryService.updateDeliveryStatus(
            req.params.orderId,
            req.user.id,
            status,
            notes
        );

        return res.json({
            success: true,
            message: "Delivery status updated"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
