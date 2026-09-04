const buyerAddressService = require("./buyerAddress.service");

exports.list = async (req, res) => {
    try {
        const addresses = await buyerAddressService.list(req.user.id);
        res.json({ success: true, data: addresses });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const address = await buyerAddressService.create(req.user.id, req.body);
        res.status(201).json({ success: true, message: "Address saved.", data: address });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.update = async (req, res) => {
    try {
        const address = await buyerAddressService.update(req.params.id, req.user.id, req.body);
        res.json({ success: true, message: "Address updated.", data: address });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.remove = async (req, res) => {
    try {
        await buyerAddressService.remove(req.params.id, req.user.id);
        res.json({ success: true, message: "Address removed." });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.setDefault = async (req, res) => {
    try {
        const address = await buyerAddressService.setDefault(req.params.id, req.user.id);
        res.json({ success: true, message: "Default address updated.", data: address });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
