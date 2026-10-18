const { body } = require("express-validator");
const { VEHICLE_TYPES } = require("../../constants/orderStatus");
const phoneValidator = require("../../validators/sharedPhoneValidator");

exports.registerValidation = [
    body("first_name").notEmpty().withMessage("First name is required"),
    body("last_name").notEmpty().withMessage("Last name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    // Round 5, phase 6. Optional at the API so older clients keep working (the
    // server then generates one); the register form always sends it. Format,
    // reserved-word and availability rules run in auth.service via
    // account/username.service.js.
    body("username")
        .optional({ nullable: true, checkFalsy: true })
        .isString()
        .withMessage("Invalid username")
        .bail()
        .trim()
        .isLength({ max: 30 })
        .withMessage("Invalid username"),
    phoneValidator("phone"),
    // Not required when the seller/agent prefilled from Google (google_ticket):
    // that account has no password of its own and signs in through Google.
    body("google_ticket").optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 2000 }),
    body("password")
        .if((value, { req }) => !req.body.google_ticket)
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters"),
    // Sent as a plain multipart/JSON field ("true"/"false" as a string on
    // multipart submissions, boolean true on JSON ones), so accept both -
    // this is a required, explicit consent checkbox on the register form,
    // not implied by merely submitting the form.
    body("terms_accepted")
        .custom((value) => value === true || value === "true")
        .withMessage("You must accept the Terms of Service and Privacy Policy"),
    body("role")
        .isIn(["buyer", "seller", "delivery_agent"])
        .withMessage("Invalid role"),

    // Business-tools-only sign-up: a seller-role account that uses the POS/stock
    // tools without listing on the marketplace (see migration 146).
    body("seller_mode")
        .optional({ nullable: true, checkFalsy: true })
        .isIn(["marketplace", "business_tools"])
        .withMessage("Invalid account type")
        .bail()
        .custom((value, { req }) => value !== "business_tools" || req.body.role === "seller")
        .withMessage("Business tools accounts must be seller accounts"),

    body("referral_code")
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ max: 12 })
        .withMessage("Invalid referral code"),

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

// Round 5, phase 7 - Google sign-in.
exports.googleSignInValidation = [
    body("credential").isString().notEmpty().isLength({ max: 4000 }).withMessage("Missing Google credential"),
    body("mode").optional({ nullable: true, checkFalsy: true }).isIn(["signin", "prefill"]).withMessage("Invalid mode")
];

exports.googleCompleteValidation = [
    body("ticket").isString().notEmpty().isLength({ max: 2000 }).withMessage("Missing sign-up ticket"),
    phoneValidator("phone"),
    body("username").optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 30 }),
    body("terms_accepted")
        .custom((value) => value === true || value === "true")
        .withMessage("You must accept the Terms of Service and Privacy Policy"),
    body("referral_code").optional({ nullable: true, checkFalsy: true }).isLength({ max: 12 }).withMessage("Invalid referral code")
];
