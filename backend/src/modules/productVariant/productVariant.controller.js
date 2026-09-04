const productVariantService = require("./productVariant.service");

exports.get = async (req, res) => {
    try {
        const data = await productVariantService.getForProduct(req.params.productId);
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.replace = async (req, res) => {
    try {
        const data = await productVariantService.replaceForProduct(
            req.user.id,
            req.params.productId,
            req.body.options,
            req.body.variants
        );
        res.json({ success: true, message: "Variants saved.", data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
