const sellerService = require("./seller.service");
const { validationResult } = require("express-validator");


// Create Seller Profile
exports.createSellerProfile = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    try {
        const result = await sellerService.createSellerProfile(
            req.user.id,
            req.body
        );

        return res.status(201).json({
            success: true,
            message: "Seller profile created successfully.",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Get Seller Profile
exports.getSellerProfile = async (req, res) => {
    try {
        const seller = await sellerService.getSellerProfile(req.user.id);

        return res.status(200).json({
            success: true,
            data: seller
        });

    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

// Update Seller Profile
exports.updateSellerProfile = async (req, res) => {
    try {
        const seller = await sellerService.updateSellerProfile(
            req.user.id,
            req.body
        );

        return res.status(200).json({
            success: true,
            message: "Seller profile updated successfully.",
            data: seller
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.uploadStoreLogo = async (req, res) => {
    try {
        const logoUrl = await sellerService.uploadStoreLogo(
            req.user.id,
            req.file
        );

        res.json({
            success: true,
            message: "Logo uploaded successfully",
            data: { logoUrl }
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.uploadStoreBanner = async (req, res) => {
    try {
        const bannerUrl = await sellerService.uploadStoreBanner(
            req.user.id,
            req.file
        );

        return res.json({
            success: true,
            message: "Banner uploaded successfully",
            data: { bannerUrl }
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
exports.getDeliveryRoster = async (req, res) => {
    try {
        const roster = await sellerService.getRoster(req.user.id);

        return res.json({
            success: true,
            data: roster
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.addDeliveryAgent = async (req, res) => {
    try {
        const agent = await sellerService.addAgentToRoster(req.user.id, req.body.email);

        return res.status(201).json({
            success: true,
            message: "Delivery agent added to your roster",
            data: agent
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.removeDeliveryAgent = async (req, res) => {
    try {
        await sellerService.removeAgentFromRoster(req.user.id, req.params.agentId);

        return res.json({
            success: true,
            message: "Delivery agent removed from your roster"
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
