const { body } = require("express-validator");
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
        .withMessage("Message must be under 2000 characters")
];
