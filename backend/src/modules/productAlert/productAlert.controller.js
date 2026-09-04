const productAlertService = require("./productAlert.service");

exports.getSubscriptions = async (req, res) => {
    try {
        const alerts = await productAlertService.getSubscriptions(req.user.id, req.params.productId);
        res.json({ success: true, data: alerts });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.subscribe = async (req, res) => {
    try {
        const { type } = req.body;
        if (type === "back_in_stock") {
            await productAlertService.subscribeBackInStock(req.user.id, req.params.productId);
        } else if (type === "price_drop") {
            await productAlertService.subscribePriceDrop(req.user.id, req.params.productId);
        } else {
            return res.status(400).json({ success: false, message: "Invalid alert type" });
        }
        res.status(201).json({ success: true, message: "You'll be notified." });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.unsubscribe = async (req, res) => {
    try {
        await productAlertService.unsubscribe(req.user.id, req.params.productId, req.params.type);
        res.json({ success: true, message: "Alert removed." });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
