const { param, body } = require("express-validator");

exports.moduleKeyValidation = [
    param("key").isString().trim().notEmpty().withMessage("Invalid module")
];

exports.setModuleActiveValidation = [
    param("key").isString().trim().notEmpty().withMessage("Invalid module"),
    body("message").optional({ nullable: true }).isString().isLength({ max: 255 })
        .withMessage("Message must be 255 characters or fewer")
];
