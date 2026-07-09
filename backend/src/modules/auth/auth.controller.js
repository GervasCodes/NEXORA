const { validationResult } = require("express-validator");
const authService = require("./auth.service");
const loginService = require("./login.service");

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

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await loginService.login(email, password);

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