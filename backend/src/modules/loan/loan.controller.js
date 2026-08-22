const loanService = require("./loan.service");

exports.getEligibility = async (req, res) => {
    try {
        const data = await loanService.getEligibility(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.requestLoan = async (req, res) => {
    try {
        const data = await loanService.requestLoan(req.user.id, req.body.amount);
        return res.status(201).json({ success: true, message: "Advance disbursed to your wallet balance", data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getMyLoans = async (req, res) => {
    try {
        const data = await loanService.getMyLoans(req.user.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
