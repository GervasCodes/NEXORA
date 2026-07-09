const { body } = require("express-validator");

exports.registerValidation = [
    body("first_name").notEmpty().withMessage("First name is required"),
    body("last_name").notEmpty().withMessage("Last name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone").notEmpty().withMessage("Phone is required"),
    body("password")
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters"),
    body("role")
        .isIn(["buyer", "seller", "delivery_agent"])
        .withMessage("Invalid role")
];