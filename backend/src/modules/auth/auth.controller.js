const { validationResult } = require("express-validator");
const authService = require("./auth.service");
const loginService = require("./login.service");
const passwordResetService = require("./passwordReset.service");

exports.register = async (req, res) => {
    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const result = await authService.register(req.body);

        res.status(201).json({
            success: true,
            message: "User registered successfully.",
            data: result
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Step 1 of login: email + password. Never returns a session token -
// only a masked email + pre-auth token, once an OTP has been emailed.
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await loginService.login(email, password);

        res.json({
            success: true,
            message: "Enter the code we emailed you to finish signing in.",
            data: result
        });

    } catch (error) {
        res.status(401).json({
            success: false,
            message: error.message
        });
    }
};

// Step 2 of login: OTP verification. Only here is a real session issued.
exports.verifyLoginOtp = async (req, res) => {
    try {
        const { pre_auth_token, code } = req.body;

        const result = await loginService.verifyLoginOtp(pre_auth_token, code);

        res.json({
            success: true,
            message: "Login successful",
            data: result
        });

    } catch (error) {
        res.status(401).json({
            success: false,
            message: error.message
        });
    }
};

exports.resendLoginOtp = async (req, res) => {
    try {
        await loginService.resendLoginOtp(req.body.pre_auth_token);

        res.json({
            success: true,
            message: "A new code has been sent."
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// Always responds success regardless of whether the email exists -
// see passwordReset.service.js for why (prevents email enumeration).
exports.forgotPassword = async (req, res) => {
    try {
        await passwordResetService.requestPasswordReset(req.body.email);
    } catch (error) {
        // Swallowed deliberately - an OTP send failure here shouldn't
        // reveal anything different to the caller than the happy path.
    }

    res.json({
        success: true,
        message: "If an account exists for that email, we've sent a reset code."
    });
};

exports.resetPassword = async (req, res) => {
    try {
        await passwordResetService.resetPassword(req.body.email, req.body.code, req.body.new_password);

        res.json({ success: true, message: "Password reset. You can now sign in." });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
