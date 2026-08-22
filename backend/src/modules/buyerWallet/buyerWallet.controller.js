const buyerWalletService = require("./buyerWallet.service");

exports.getSummary = async (req, res) => {
    try {
        const data = await buyerWalletService.getSummary(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
