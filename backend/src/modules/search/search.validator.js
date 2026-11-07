const { body } = require("express-validator");

exports.logQueryValidation = [
    body("term")
        .isString()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage("Invalid search term")
];
