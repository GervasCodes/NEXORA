const serviceService = require("./service.service");
const { validationResult } = require("express-validator");

exports.createService = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    try {
        const result = await serviceService.createService(req.user.id, req.body);

        return res.status(201).json({
            success: true,
            message: "Service created successfully",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.listServices = async (req, res) => {
    try {
        const result = await serviceService.listServices(req.query);

        return res.json({
            success: true,
            data: result.services,
            pagination: result.pagination
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Phase 4 (Customer Experience) - feeds ServiceFilters.jsx's Location
// dropdown, mirroring product.controller.js#listFilterRegions.
exports.listFilterRegions = async (req, res) => {
    try {
        const regions = await serviceService.listFilterRegions(req.query);

        return res.json({
            success: true,
            data: regions
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getServiceBySlug = async (req, res) => {
    try {
        const service = await serviceService.getServiceBySlug(req.params.slug);

        return res.json({
            success: true,
            data: service
        });

    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

exports.uploadServiceImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "An image file is required"
            });
        }

        const result = await serviceService.addMedia(
            req.user.id,
            req.params.id,
            req.file,
            "image",
            req.body.is_primary === "true"
        );

        return res.status(201).json({
            success: true,
            message: "Image uploaded",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.uploadServiceVideo = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "A video file is required"
            });
        }

        const result = await serviceService.addMedia(
            req.user.id,
            req.params.id,
            req.file,
            "video",
            false
        );

        return res.status(201).json({
            success: true,
            message: "Video uploaded",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getMyServices = async (req, res) => {
    try {
        const services = await serviceService.getMyServices(req.user.id);

        return res.json({
            success: true,
            data: services
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getMyServiceById = async (req, res) => {
    try {
        const service = await serviceService.getMyServiceById(req.user.id, req.params.id);

        return res.json({
            success: true,
            data: service
        });

    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

exports.updateService = async (req, res) => {
    try {
        const service = await serviceService.updateService(req.user.id, req.params.id, req.body);

        return res.json({
            success: true,
            message: "Service updated",
            data: service
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.publishService = async (req, res) => {
    try {
        await serviceService.publishService(req.user.id, req.params.id);

        return res.json({ success: true, message: "Service published" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.unpublishService = async (req, res) => {
    try {
        await serviceService.unpublishService(req.user.id, req.params.id);

        return res.json({ success: true, message: "Service moved back to draft" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.deactivateMyService = async (req, res) => {
    try {
        await serviceService.setServiceActiveByProvider(req.user.id, req.params.id, false);

        return res.json({ success: true, message: "Service deactivated" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.activateMyService = async (req, res) => {
    try {
        await serviceService.setServiceActiveByProvider(req.user.id, req.params.id, true);

        return res.json({ success: true, message: "Service activated" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// --- Dynamic pricing rules (Phase 5 - Growth) --------------------------

exports.createPricingRule = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    try {
        const result = await serviceService.createPricingRule(req.user.id, req.params.id, req.body);

        return res.status(201).json({ success: true, message: "Pricing rule created", data: result });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getPricingRules = async (req, res) => {
    try {
        const rules = await serviceService.getPricingRules(req.user.id, req.params.id);

        return res.json({ success: true, data: rules });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.deactivatePricingRule = async (req, res) => {
    try {
        await serviceService.setPricingRuleActive(req.user.id, req.params.ruleId, false);

        return res.json({ success: true, message: "Pricing rule paused" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.activatePricingRule = async (req, res) => {
    try {
        await serviceService.setPricingRuleActive(req.user.id, req.params.ruleId, true);

        return res.json({ success: true, message: "Pricing rule resumed" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.deletePricingRule = async (req, res) => {
    try {
        await serviceService.deletePricingRule(req.user.id, req.params.ruleId);

        return res.json({ success: true, message: "Pricing rule removed" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
