const adminService = require("./admin.service");

exports.listUsers = async (req, res) => {
    try {
        const users = await adminService.listUsers();

        return res.json({ success: true, data: users });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.deactivateUser = async (req, res) => {
    try {
        await adminService.setUserActive(req.params.id, false);

        return res.json({ success: true, message: "User deactivated" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.activateUser = async (req, res) => {
    try {
        await adminService.setUserActive(req.params.id, true);

        return res.json({ success: true, message: "User activated" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listSellers = async (req, res) => {
    try {
        const sellers = await adminService.listSellers();

        return res.json({ success: true, data: sellers });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.verifySeller = async (req, res) => {
    try {
        await adminService.setSellerVerified(req.params.id, true);

        return res.json({ success: true, message: "Seller verified" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.unverifySeller = async (req, res) => {
    try {
        await adminService.setSellerVerified(req.params.id, false);

        return res.json({ success: true, message: "Seller verification removed" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listProducts = async (req, res) => {
    try {
        const products = await adminService.listProducts();

        return res.json({ success: true, data: products });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.deactivateProduct = async (req, res) => {
    try {
        await adminService.setProductActive(req.params.id, false);

        return res.json({ success: true, message: "Product deactivated" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.activateProduct = async (req, res) => {
    try {
        await adminService.setProductActive(req.params.id, true);

        return res.json({ success: true, message: "Product activated" });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.listOrders = async (req, res) => {
    try {
        const orders = await adminService.listAllOrders();

        return res.json({ success: true, data: orders });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.getDashboard = async (req, res) => {
    try {
        const stats = await adminService.getDashboard();

        return res.json({ success: true, data: stats });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// --- Platform settings ---

exports.getSettings = async (req, res) => {
    try {
        const settings = await adminService.getSettings();

        return res.json({ success: true, data: settings });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const settings = await adminService.updateSettings(req.body);

        return res.json({ success: true, message: "Settings updated", data: settings });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

// --- Seller withdrawal requests ---

exports.listWithdrawals = async (req, res) => {
    try {
        const withdrawals = await adminService.listWithdrawals();

        return res.json({ success: true, data: withdrawals });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.approveWithdrawal = async (req, res) => {
    try {
        const result = await adminService.approveWithdrawal(req.params.id, req.body.admin_note);

        return res.json({ success: true, message: "Withdrawal approved", data: result });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.rejectWithdrawal = async (req, res) => {
    try {
        const result = await adminService.rejectWithdrawal(req.params.id, req.body.admin_note);

        return res.json({ success: true, message: "Withdrawal rejected and refunded", data: result });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.markWithdrawalPaid = async (req, res) => {
    try {
        const result = await adminService.markWithdrawalPaid(req.params.id, req.body.admin_note);

        return res.json({ success: true, message: "Withdrawal marked as paid", data: result });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
