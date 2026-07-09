const { body } = require("express-validator");

exports.subscribeValidation = [
    body("subscription.endpoint").isURL().withMessage("Invalid subscription"),
    body("subscription.keys.p256dh").notEmpty().withMessage("Invalid subscription"),
    body("subscription.keys.auth").notEmpty().withMessage("Invalid subscription")
];

exports.unsubscribeValidation = [
    body("endpoint").notEmpty().withMessage("Missing endpoint")
];
