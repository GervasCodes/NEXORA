const storeTypeService = require("./storeType.service");

exports.listPublic = async (req, res) => {
    try {
        const storeTypes = await storeTypeService.listPublic();
        return res.json({ success: true, data: storeTypes });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listForAdmin = async (req, res) => {
    try {
        const storeTypes = await storeTypeService.listForAdmin();
        return res.json({ success: true, data: storeTypes });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.createStoreType = async (req, res) => {
    try {
        const result = await storeTypeService.createStoreType(req.body.name);
        return res.status(201).json({ success: true, message: "Store type created", data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateStoreType = async (req, res) => {
    try {
        await storeTypeService.updateStoreType(req.params.id, req.body.name);
        return res.json({ success: true, message: "Store type updated" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.deactivateStoreType = async (req, res) => {
    try {
        await storeTypeService.setStoreTypeActive(req.params.id, false);
        return res.json({ success: true, message: "Store type deactivated" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.activateStoreType = async (req, res) => {
    try {
        await storeTypeService.setStoreTypeActive(req.params.id, true);
        return res.json({ success: true, message: "Store type activated" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
