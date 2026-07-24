const { body } = require("express-validator");
const { STORE_THEMES } = require("./seller.constants");

exports.createSellerValidation = [
    body("store_name")
        .trim()
        .notEmpty()
        .withMessage("Store name is required.")
        .isLength({ min: 3, max: 150 })
        .withMessage("Store name must be between 3 and 150 characters."),

    body("store_description")
        .optional()
        .isLength({ max: 1000 })
        .withMessage("Store description cannot exceed 1000 characters."),

    body("store_type_id")
        .optional()
        .isInt({ gt: 0 })
        .withMessage("Invalid store type")
];

exports.updateSellerValidation = [
    body("store_name")
        .optional()
        .trim()
        .isLength({ min: 3, max: 150 })
        .withMessage("Store name must be between 3 and 150 characters."),

    body("store_description")
        .optional()
        .isLength({ max: 1000 })
        .withMessage("Store description cannot exceed 1000 characters."),

    body("business_email")
        .optional()
        .isEmail()
        .withMessage("Invalid email address."),

    body("business_phone")
        .optional()
        .isLength({ min: 10, max: 20 })
        .withMessage("Invalid phone number."),

    body("store_type_id")
        .optional()
        .isInt({ gt: 0 })
        .withMessage("Invalid store type"),

    body("pickup_lat")
        .optional({ nullable: true })
        .isFloat({ min: -90, max: 90 })
        .withMessage("Invalid pickup latitude"),

    body("pickup_lng")
        .optional({ nullable: true })
        .isFloat({ min: -180, max: 180 })
        .withMessage("Invalid pickup longitude"),

    body("store_theme")
        .optional()
        .isIn(STORE_THEMES)
        .withMessage("Invalid store theme"),

    body("store_tagline")
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 150 })
        .withMessage("Store tagline cannot exceed 150 characters."),

    body("social_instagram")
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 150 })
        .withMessage("Instagram link cannot exceed 150 characters."),

    body("social_facebook")
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 150 })
        .withMessage("Facebook link cannot exceed 150 characters."),

    body("social_whatsapp")
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 20 })
        .withMessage("Invalid WhatsApp number.")
];

exports.addDeliveryAgentValidation = [
    body("email")
        .isEmail()
        .withMessage("A valid email is required")
];

exports.createCollectionValidation = [
    body("name")
        .trim()
        .notEmpty()
        .withMessage("A collection name is required.")
        .isLength({ max: 80 })
        .withMessage("Collection name cannot exceed 80 characters.")
];

exports.addCollectionProductValidation = [
    body("product_id")
        .isInt({ gt: 0 })
        .withMessage("A valid product_id is required.")
];

exports.payVerificationFeeValidation = [
    body("phone")
        .trim()
        .notEmpty()
        .withMessage("A mobile money phone number is required")
        .isLength({ min: 10, max: 20 })
        .withMessage("Invalid phone number.")
];
