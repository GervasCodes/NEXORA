const broadcastRepository = require("./broadcast.repository");
const logger = require("../../utils/logger").child({ module: "brevoWebhook" });

// Brevo's event names for the outcomes this phase cares about - see
// developers.brevo.com/docs/transactional-webhooks. `blocked` (Brevo
// refused to even attempt delivery, e.g. a suppressed address) is
// treated as a bounce for this simple mapping since either way the
// message never reached an inbox.
const EVENT_TYPE_MAP = {
    delivered: "delivered",
    hard_bounce: "hard_bounce",
    soft_bounce: "soft_bounce",
    blocked: "hard_bounce",
    spam: "spam"
};

// Brevo can be configured to send either a single event object per
// webhook call, or a batch (an array of event objects) - handle both so
// this doesn't silently drop events if that setting differs from what
// was assumed when this was wired up.
const asEventList = (body) => {
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.events)) return body.events;
    return [body];
};

exports.handleEvent = async (req, res) => {
    const events = asEventList(req.body);

    for (const event of events) {
        if (!event || !event.email) continue;

        const eventType = EVENT_TYPE_MAP[event.event] || "other";

        try {
            await broadcastRepository.recordDeliveryEvent({
                eventType,
                recipientEmail: event.email,
                brevoMessageId: event["message-id"] || event.messageId || null,
                rawEvent: event
            });
        } catch (error) {
            // A storage hiccup here should never make Brevo retry-storm
            // the webhook (same "always 200, log and move on" reasoning
            // every other webhook in webhookAuth.middleware.js follows).
            logger.error({ err: error, event }, "[brevo webhook] failed to record delivery event");
        }
    }

    return res.status(200).json({ success: true });
};
