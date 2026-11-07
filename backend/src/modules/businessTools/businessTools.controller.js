const businessToolsService = require("./businessTools.service");

exports.convert = async (req, res) => {
    try {
        const user = await businessToolsService.convertToMarketplace(req.user.id, req.files);
        res.json({
            success: true,
            message: "Your account is now a marketplace seller account and is under review.",
            data: { user }
        });
    } catch (error) {
        res.status(error.statusCode || 400).json({ success: false, message: error.message });
    }
};
