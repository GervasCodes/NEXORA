const { body, query } = require("express-validator");

exports.webVitalsValidation = [
    body("metric").isIn(["LCP", "CLS", "INP", "FCP", "TTFB"]),
    body("value").isFloat({ min: 0, max: 600000 }),
    body("rating").isIn(["good", "needs-improvement", "poor"]),
    body("path").isString().isLength({ min: 1, max: 300 }),
    body("device").optional().isIn(["mobile", "desktop"])
];

exports.searchMissValidation = [
    body("term").isString().trim().isLength({ min: 2, max: 120 }),
    body("scope").optional().isIn(["products", "services"])
];

exports.adminListValidation = [
    query("limit").optional().isInt({ min: 1, max: 200 }),
    query("days").optional().isInt({ min: 1, max: 90 })
];
