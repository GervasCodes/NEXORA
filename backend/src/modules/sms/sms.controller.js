const deliveryService = require("../delivery/delivery.service");
const smsProvider = require("./providers/sms.provider");
const logger = require("../../utils/logger").child({ module: "sms" });

// Beem Africa's two-way/inbound SMS callback shape isn't fully public
// without a business relationship with their team (same caveat
// selcom.provider.js's header comment carries for Selcom's C2B docs) -
// this reads every commonly-used field name for "sender" and "message
// text" across gateway vendors rather than committing to one exact
// shape, and logs the raw body on a miss so the real shape can be
// confirmed against your sandbox and this narrowed down later.
// STILL VERIFY AGAINST A REAL SANDBOX BEFORE GOING LIVE.
const extractSender = (body) =>
    body.source_addr || body.from || body.sender_id || body.msisdn || body.dest_addr || null;

const extractText = (body) =>
    body.message || body.text || body.content || null;

// This route only exists to let a delivery agent accept/decline a
// pickup offer by replying "YES <offerId>" / "NO <offerId>" - unlike
// the WhatsApp webhook, there's no buyer-facing numbered-menu bot on
// this channel (SMS is the fallback-of-last-resort path, see
// delivery.service.js#offerToNextCandidate), so anything that isn't a
// recognized offer reply is acknowledged and otherwise ignored.
exports.receiveMessage = async (req, res) => {
    // Ack immediately - same reasoning as whatsapp.controller.js's
    // receiveMessage: gateways retry deliveries that don't get a fast
    // 2xx, and how long the reply takes to compute/send shouldn't hold
    // that up.
    res.status(200).json({ success: true });

    try {
        const body = req.body || {};
        const from = extractSender(body);
        const text = extractText(body);

        if (!from || !text) {
            logger.warn({ body }, "sms inbound webhook - couldn't identify sender/text fields, check gateway payload shape");
            return;
        }

        const reply = await deliveryService.handleOfferReplyByPhone(from, text, "sms");
        if (reply) {
            await smsProvider.sendText(from, reply).catch((err) =>
                logger.warn({ err, from }, "sms send error (offer reply confirmation)")
            );
        }
    } catch (error) {
        logger.error({ err: error }, "sms inbound message handling error");
    }
};
