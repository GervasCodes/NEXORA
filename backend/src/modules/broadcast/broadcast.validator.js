const { body, param } = require("express-validator");
const { BROADCAST_SEGMENTS, BROADCAST_CHANNELS } = require("../../constants/broadcast");

exports.previewValidation = [
    body("segment")
        .notEmpty()
        .withMessage("Segment is required")
        .isIn(BROADCAST_SEGMENTS)
        .withMessage(`Segment must be one of: ${BROADCAST_SEGMENTS.join(", ")}`)
];

exports.sendBroadcastValidation = [
    body("segment")
        .notEmpty()
        .withMessage("Segment is required")
        .isIn(BROADCAST_SEGMENTS)
        .withMessage(`Segment must be one of: ${BROADCAST_SEGMENTS.join(", ")}`),

    body("channels")
        .isArray({ min: 1 })
        .withMessage("At least one channel is required"),

    body("channels.*")
        .isIn(BROADCAST_CHANNELS)
        .withMessage(`Each channel must be one of: ${BROADCAST_CHANNELS.join(", ")}`),

    body("subject")
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 150 })
        .withMessage("Subject must be under 150 characters"),

    body("message")
        .trim()
        .notEmpty()
        .withMessage("Message is required")
        .isLength({ max: 2000 })
        .withMessage("Message must be under 2000 characters"),

    // Per-channel overrides (Fix Plan Phase 1.3 - AdminBroadcast.jsx gives
    // each channel its own box). All optional: a blank one falls back to
    // the shared `message`/`subject` above - see
    // broadcast.service.js#resolveChannelContent. Limits reflect what each
    // channel actually is: an SMS is billed/split in ~160-char segments
    // (320 ~= 2 segments, a sane single-message cap), WhatsApp has more
    // headroom but isn't an email, and in_app is read as one line in
    // NotificationBell.jsx.
    body("smsMessage")
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 320 })
        .withMessage("SMS message must be under 320 characters"),

    body("whatsappMessage")
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 1000 })
        .withMessage("WhatsApp message must be under 1000 characters"),

    body("inAppTitle")
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 150 })
        .withMessage("In-app title must be under 150 characters"),

    body("inAppMessage")
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 1000 })
        .withMessage("In-app message must be under 1000 characters")
];

// Shared by DELETE /:id and POST /:id/resend.
exports.idParamValidation = [
    param("id").isInt({ min: 1 }).withMessage("Invalid broadcast id")
];
