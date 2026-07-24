const { body, param } = require("express-validator");

exports.createCampaignValidation = [
    body("category_id")
        .isInt({ gt: 0 })
        .withMessage("A valid department is required"),

    body("days")
        .isInt({ min: 1, max: 30 })
        .withMessage("Duration must be between 1 and 30 days")
];

exports.campaignIdValidation = [
    param("id").isInt({ gt: 0 }).withMessage("Invalid campaign")
];
