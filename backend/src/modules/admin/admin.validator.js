const { param, body } = require("express-validator");

exports.userIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid user")
];

exports.productIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid product")
];

exports.withdrawalIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid withdrawal request")
];

exports.updateSettingsValidation = [
    body("commission_rate")
        .optional()
        .isFloat({ min: 0, max: 100 })
        .withMessage("Commission rate must be between 0 and 100"),

    body("rider_delivery_fee")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Rider delivery fee must be a positive amount"),

    body("seller_verification_fee")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Verification fee must be a positive amount"),

    body("usd_exchange_rate")
        .optional()
        .isFloat({ min: 1 })
        .withMessage("Exchange rate must be a positive number (TZS per 1 USD)"),

    body("delivery_distance_bands")
        .optional()
        .custom((value) => {
            if (!value || !Array.isArray(value.bands) || value.bands.length === 0) {
                throw new Error("At least one distance band is required");
            }
            for (const band of value.bands) {
                if (typeof band.up_to_km !== "number" || band.up_to_km <= 0) {
                    throw new Error("Each band's distance (km) must be a positive number");
                }
                if (typeof band.fee !== "number" || band.fee < 0) {
                    throw new Error("Each band's fee must be zero or a positive number");
                }
            }
            if (value.per_km_beyond !== undefined && (typeof value.per_km_beyond !== "number" || value.per_km_beyond < 0)) {
                throw new Error("The per-km overage rate must be zero or a positive number");
            }
            return true;
        })
];

exports.createAdminValidation = [
    body("first_name").notEmpty().withMessage("First name is required"),
    body("last_name").notEmpty().withMessage("Last name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone").notEmpty().withMessage("Phone is required"),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
    body("admin_level")
        .optional()
        .isIn(["admin", "super_admin"])
        .withMessage("Invalid admin level")
];

exports.updateAdminPermissionsValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid admin"),
    body("admin_level")
        .isIn(["admin", "super_admin"])
        .withMessage("Invalid admin level")
];
