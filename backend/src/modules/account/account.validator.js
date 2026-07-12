const { body } = require("express-validator");

exports.updateProfileValidation = [
    body("first_name").optional().trim().notEmpty().withMessage("First name can't be empty"),
    body("last_name").optional().trim().notEmpty().withMessage("Last name can't be empty"),
    body("email").optional().isEmail().withMessage("Invalid email address"),
    body("phone").optional().isLength({ min: 8, max: 20 }).withMessage("Invalid phone number")
];

exports.updateSettingsValidation = [
    body("language")
        .optional()
        .isLength({ min: 2, max: 10 })
        .withMessage("Invalid language code"),

    body("theme")
        .optional()
        .isIn(["light", "dark", "system"])
        .withMessage("Theme must be light, dark, or system"),

    body("currency")
        .optional()
        .isLength({ min: 3, max: 10 })
        .withMessage("Invalid currency code")
];

exports.verifyPasswordChangeOtpValidation = [
    body("code").trim().isLength({ min: 6, max: 6 }).withMessage("Enter the 6-digit code")
];

exports.changePasswordValidation = [
    body("reauth_token").notEmpty().withMessage("Please verify with the emailed code first"),
    body("new_password").isLength({ min: 8 }).withMessage("New password must be at least 8 characters")
];

exports.deleteAccountValidation = [
    body("password").notEmpty().withMessage("Password is required to delete your account")
];
