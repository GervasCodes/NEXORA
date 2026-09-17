const { param, body, query } = require("express-validator");

// `test_only` is intentionally NOT run through .toBoolean() here:
// express-validator's toBoolean() maps anything non-empty to true, which
// would turn a typo'd `test_only: "flase"` into the *safe* value by luck
// rather than by design. The controller does the narrowing instead, where
// "only literal false widens the scope" is written explicitly.
const testOnlyBody = body("test_only")
    .optional()
    .isBoolean().withMessage("test_only must be true or false");

const testOnlyQuery = query("test_only")
    .optional()
    .isBoolean().withMessage("test_only must be true or false");

const confirmation = body("confirmation")
    .isString().withMessage("A typed confirmation is required")
    .bail()
    .notEmpty().withMessage("A typed confirmation is required")
    .isLength({ max: 100 }).withMessage("Invalid confirmation");

exports.sellerResetPreviewValidation = [
    param("sellerId").isInt({ gt: 0 }).withMessage("Invalid seller"),
    testOnlyQuery
];

exports.sellerResetValidation = [
    param("sellerId").isInt({ gt: 0 }).withMessage("Invalid seller"),
    testOnlyBody,
    confirmation
];

exports.platformResetPreviewValidation = [testOnlyQuery];

exports.platformResetValidation = [testOnlyBody, confirmation];
