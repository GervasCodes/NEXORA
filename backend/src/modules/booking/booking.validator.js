const { body, param } = require("express-validator");

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

exports.createBookingValidation = [
    body("service_id")
        .isInt({ gt: 0 })
        .withMessage("A valid service_id is required"),

    body("start_date")
        .matches(DATE_REGEX)
        .withMessage("start_date must be in YYYY-MM-DD format"),

    body("end_date")
        .matches(DATE_REGEX)
        .withMessage("end_date must be in YYYY-MM-DD format"),

    body("quantity")
        .optional()
        .isInt({ min: 1 })
        .withMessage("quantity must be a positive number")
];

exports.bookingIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid booking")
];
