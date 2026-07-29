const { body, param } = require("express-validator");

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

exports.setAvailabilityValidation = [
    param("serviceId").isInt({ gt: 0 }).withMessage("Invalid service"),

    body("startDate")
        .matches(DATE_REGEX)
        .withMessage("startDate must be in YYYY-MM-DD format"),

    body("endDate")
        .matches(DATE_REGEX)
        .withMessage("endDate must be in YYYY-MM-DD format"),

    body("availableUnits")
        .isInt({ min: 0 })
        .withMessage("availableUnits must be a non-negative number"),

    body("price")
        .optional({ nullable: true })
        .isNumeric()
        .withMessage("price must be a number"),

    body("status")
        .optional()
        .isIn(["open", "closed"])
        .withMessage("status must be open or closed")
];
