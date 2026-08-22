const { body, param } = require("express-validator");

exports.createValidation = [
    body("name").notEmpty().withMessage("Name is required"),
    body("address").notEmpty().withMessage("Address is required"),
    body("city").notEmpty().withMessage("City is required"),
    body("region").notEmpty().withMessage("Region is required"),
    body("latitude").optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
    body("longitude").optional({ nullable: true }).isFloat({ min: -180, max: 180 })
];

exports.idValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid pickup point")
];
