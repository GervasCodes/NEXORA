const { body } = require("express-validator");
const { STORE_THEMES } = require("./seller.constants");
const phoneValidator = require("../../validators/sharedPhoneValidator");
const { isValidTanzaniaPin, MAX_ACCURACY_M } = require("../../utils/pickupPin");

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
        .withMessage("Invalid store type"),

    // Optional here (Phase 4 remediation): store creation defaults to
    // 'product' when omitted, matching the column default - the same
    // onboarding flow that skips this field keeps working unchanged.
    body("merchant_type")
        .optional()
        .isIn(["product", "service", "hybrid"])
        .withMessage("merchant_type must be one of: product, service, hybrid")
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

    phoneValidator("business_phone", { optional: true }),

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

    // Phase 2: a pin must be set as a pair, and sit inside Tanzania (this
    // also rejects (0,0) and swapped lat/lng). Clearing both (null) is
    // still allowed.
    body("pickup_lat").custom((value, { req }) => {
        const lat = req.body.pickup_lat;
        const lng = req.body.pickup_lng;
        const latSet = lat !== undefined && lat !== null && lat !== "";
        const lngSet = lng !== undefined && lng !== null && lng !== "";
        if (!latSet && !lngSet) return true;
        if (latSet !== lngSet) throw new Error("Set both pickup latitude and longitude");
        if (!isValidTanzaniaPin(lat, lng)) {
            throw new Error("The store location must be inside Tanzania - move the pin to your shop");
        }
        return true;
    }),

    body("pickup_accuracy_m")
        .optional({ nullable: true })
        .isFloat({ min: 0, max: MAX_ACCURACY_M })
        .withMessage("Invalid location accuracy"),

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
        .withMessage("Invalid WhatsApp number."),

    // Public call number (shown as a Call button). Digits, spaces, + and -
    // only; blank clears it.
    body("public_phone")
        .optional({ nullable: true })
        .trim()
        .matches(/^[+0-9 ()-]{0,20}$/)
        .withMessage("Call number can only contain digits, spaces, +, - and brackets."),

    // Pre-order / made-to-order (Phase 8) - store-level toggle + defaults.
    body("accepts_preorders")
        .optional()
        .isBoolean()
        .withMessage("accepts_preorders must be true or false.")
        .toBoolean(),

    body("preorder_deposit_percent")
        .optional()
        .isFloat({ min: 1, max: 100 })
        .withMessage("Deposit percent must be between 1 and 100.")
        .toFloat(),

    body("preorder_default_lead_time_days")
        .optional({ nullable: true })
        .isInt({ min: 1, max: 365 })
        .withMessage("Lead time must be between 1 and 365 days.")
        .toInt()
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

// Nexora Services Phase 1 - Merchant Type System
exports.merchantTypeValidation = [
    body("merchant_type")
        .notEmpty()
        .withMessage("merchant_type is required")
        .isIn(["product", "service", "hybrid"])
        .withMessage("merchant_type must be one of: product, service, hybrid")
];
