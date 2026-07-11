const { body } = require("express-validator");

exports.createSellerValidation = [
    body("store_name")
        .trim()
        .notEmpty()
        .withMessage("Store name is required.")
        .isLength({ min: 3, max: 150 })
        .withMessage("Store name must be between 3 and 150 characters."),

    body("store_description")
        .optional()
        .isLength({ max: 1000 })
        .withMessage("Store description cannot exceed 1000 characters."),

    body("store_type_id")
        .optional()
        .isInt({ gt: 0 })
        .withMessage("Invalid store type")
];

exports.updateSellerValidation = [
    body("store_name")
        .optional()
        .trim()
        .isLength({ min: 3, max: 150 })
        .withMessage("Store name must be between 3 and 150 characters."),

    body("store_description")
        .optional()
        .isLength({ max: 1000 })
        .withMessage("Store description cannot exceed 1000 characters."),

    body("business_email")
        .optional()
        .isEmail()
        .withMessage("Invalid email address."),

    body("business_phone")
        .optional()
        .isLength({ min: 10, max: 20 })
        .withMessage("Invalid phone number."),

    body("store_type_id")
        .optional()
        .isInt({ gt: 0 })
        .withMessage("Invalid store type")
];

exports.addDeliveryAgentValidation = [
    body("email")
        .isEmail()
        .withMessage("A valid email is required")
];

exports.payVerificationFeeValidation = [
    body("phone")
        .trim()
        .notEmpty()
        .withMessage("A mobile money phone number is required")
        .isLength({ min: 10, max: 20 })
        .withMessage("Invalid phone number.")
];
