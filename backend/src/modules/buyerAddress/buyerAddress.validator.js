const { body, param } = require("express-validator");
const phoneValidator = require("../../validators/sharedPhoneValidator");

exports.addressIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid address")
];

exports.addressValidation = [
    body("label")
        .optional({ checkFalsy: true })
        .isLength({ max: 60 })
        .withMessage("Label is too long"),

    body("recipient_name")
        .optional({ checkFalsy: true })
        .isLength({ max: 150 })
        .withMessage("Recipient name is too long"),

    body("address")
        .notEmpty()
        .withMessage("Street address is required"),

    body("city")
        .notEmpty()
        .withMessage("City is required"),

    body("region")
        .notEmpty()
        .withMessage("Region is required"),

    phoneValidator("phone"),

    body("latitude")
        .optional({ nullable: true })
        .isFloat({ min: -90, max: 90 })
        .withMessage("Invalid latitude"),

    body("longitude")
        .optional({ nullable: true })
        .isFloat({ min: -180, max: 180 })
        .withMessage("Invalid longitude"),

    body("is_default")
        .optional()
        .isBoolean()
        .withMessage("Invalid default flag")
];
