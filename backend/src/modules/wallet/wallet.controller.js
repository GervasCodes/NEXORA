const walletService = require("./wallet.service");

exports.getWallet = async (req, res) => {
    try {
        const summary = await walletService.getWalletSummary(req.user.id);

        return res.json({
            success: true,
            data: summary
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.requestWithdrawal = async (req, res) => {
    try {
        const result = await walletService.requestWithdrawal(
            req.user.id,
            req.body.amount,
            req.body.payout_method,
            req.body.payout_details
        );

        return res.status(201).json({
            success: true,
            message: "Withdrawal request submitted",
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

exports.getMyWithdrawals = async (req, res) => {
    try {
        const withdrawals = await walletService.getMyWithdrawals(req.user.id);

        return res.json({
            success: true,
            data: withdrawals
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
