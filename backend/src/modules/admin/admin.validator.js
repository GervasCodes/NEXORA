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
        .withMessage("Verification fee must be a positive amount")
];

exports.rejectVerificationValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid seller"),
    body("reason")
        .trim()
        .notEmpty()
        .withMessage("A rejection reason is required")
        .isLength({ max: 255 })
        .withMessage("Reason cannot exceed 255 characters")
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
