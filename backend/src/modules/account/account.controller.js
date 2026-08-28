const accountService = require("./account.service");
const { t } = require("../../i18n");

exports.getProfile = async (req, res) => {
    try {
        const profile = await accountService.getProfile(req.user.id);

        return res.json({ success: true, data: profile });

    } catch (error) {
        return res.status(error.status || 400).json({
            success: false,
            message: error.code ? t(req.locale, `errors.${error.code}`) : error.message
        });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const profile = await accountService.updateProfile(req.user.id, req.body);

        return res.json({ success: true, message: "Profile updated successfully.", data: profile });

    } catch (error) {
        return res.status(error.status || 400).json({
            success: false,
            message: error.code ? t(req.locale, `errors.${error.code}`) : error.message
        });
    }
};

exports.uploadProfilePhoto = async (req, res) => {
    try {
        const photoUrl = await accountService.uploadProfilePhoto(req.user.id, req.file);

        return res.json({
            success: true,
            message: "Photo uploaded successfully.",
            data: { photoUrl }
        });

    } catch (error) {
        return res.status(error.status || 400).json({
            success: false,
            message: error.code ? t(req.locale, `errors.${error.code}`) : error.message
        });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const profile = await accountService.updateSettings(req.user.id, req.body);

        return res.json({ success: true, message: "Settings updated successfully.", data: profile });

    } catch (error) {
        return res.status(error.status || 400).json({
            success: false,
            message: error.code ? t(req.locale, `errors.${error.code}`) : error.message
        });
    }
};

exports.requestPasswordChangeOtp = async (req, res) => {
    try {
        await accountService.requestPasswordChangeOtp(req.user.id);

        return res.json({ success: true, message: "A verification code has been emailed to you." });

    } catch (error) {
        return res.status(error.status || 400).json({
            success: false,
            message: error.code ? t(req.locale, `errors.${error.code}`) : error.message
        });
    }
};

exports.verifyPasswordChangeOtp = async (req, res) => {
    try {
        const reauth_token = await accountService.verifyPasswordChangeOtp(req.user.id, req.body.code);

        return res.json({ success: true, message: "Verified.", data: { reauth_token } });

    } catch (error) {
        return res.status(error.status || 400).json({
            success: false,
            message: error.code ? t(req.locale, `errors.${error.code}`) : error.message
        });
    }
};

exports.changePassword = async (req, res) => {
    try {
        await accountService.changePassword(req.user.id, req.body.reauth_token, req.body.new_password);

        return res.json({ success: true, message: "Password changed successfully." });

    } catch (error) {
        return res.status(error.status || 400).json({
            success: false,
            message: error.code ? t(req.locale, `errors.${error.code}`) : error.message
        });
    }
};

exports.deleteAccount = async (req, res) => {
    try {
        await accountService.deleteAccount(req.user.id, req.body.password);

        return res.json({ success: true, message: "Your account has been deleted and can no longer be logged into." });

    } catch (error) {
        return res.status(error.status || 400).json({
            success: false,
            message: error.code ? t(req.locale, `errors.${error.code}`) : error.message
        });
    }
};
