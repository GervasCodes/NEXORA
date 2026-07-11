const accountService = require("./account.service");

exports.getProfile = async (req, res) => {
    try {
        const profile = await accountService.getProfile(req.user.id);

        return res.json({ success: true, data: profile });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const profile = await accountService.updateProfile(req.user.id, req.body);

        return res.json({ success: true, message: "Profile updated successfully.", data: profile });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const profile = await accountService.updateSettings(req.user.id, req.body);

        return res.json({ success: true, message: "Settings updated successfully.", data: profile });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        await accountService.changePassword(req.user.id, req.body.current_password, req.body.new_password);

        return res.json({ success: true, message: "Password changed successfully." });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.deleteAccount = async (req, res) => {
    try {
        await accountService.deleteAccount(req.user.id, req.body.password);

        return res.json({ success: true, message: "Your account has been permanently deleted." });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
