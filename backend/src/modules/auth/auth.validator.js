const { body } = require("express-validator");
const { VEHICLE_TYPES } = require("../../constants/orderStatus");

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
        .withMessage("Invalid role"),

    // Vehicle type/plate are only required for delivery_agent registrations
    // - a plain multipart form field, so this arrives as a string on every
    // submission (never undefined the way a missing file would be).
    body("vehicle_type")
        .if(body("role").equals("delivery_agent"))
        .notEmpty()
        .withMessage("Vehicle type is required")
        .bail()
        .isIn(VEHICLE_TYPES)
        .withMessage("Invalid vehicle type"),

    body("vehicle_plate_number")
        .if(body("role").equals("delivery_agent"))
        .trim()
        .notEmpty()
        .withMessage("Vehicle plate number is required")
        .isLength({ max: 20 })
        .withMessage("Plate number is too long")
];