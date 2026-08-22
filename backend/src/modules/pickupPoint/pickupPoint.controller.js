const pickupPointService = require("./pickupPoint.service");

exports.listActive = async (req, res) => {
    try {
        const { region, city } = req.query;
        const data = await pickupPointService.listActive({ region, city });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listAll = async (req, res) => {
    try {
        const data = await pickupPointService.listAll();
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const data = await pickupPointService.create(req.body);
        return res.status(201).json({ success: true, message: "Pickup point created", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.update = async (req, res) => {
    try {
        const data = await pickupPointService.update(req.params.id, req.body);
        return res.json({ success: true, message: "Pickup point updated", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
