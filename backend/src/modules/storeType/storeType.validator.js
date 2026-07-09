const { body, param } = require("express-validator");

exports.createStoreTypeValidation = [
    body("name").notEmpty().withMessage("Store type name is required")
];

exports.updateStoreTypeValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid store type"),
    body("name").notEmpty().withMessage("Store type name is required")
];

exports.storeTypeIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid store type")
];
