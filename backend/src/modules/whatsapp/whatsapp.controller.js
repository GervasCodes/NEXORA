const whatsappService = require("./whatsapp.service");
const whatsappProvider = require("./providers/whatsapp.provider");
const logger = require("../../utils/logger").child({ module: "whatsapp" });

// Meta's one-time subscription check when you first configure the
// webhook URL in the app dashboard: it sends a GET with these three
// query params and expects the raw hub.challenge value echoed back.
// In-app equivalent of the bot's "4 - toggle order updates" reply, for
// a buyer who'd rather flip this from Account settings than text the
// bot. Requires the account's phone to actually be reachable on
// WhatsApp - there's no separate verification step here, so this is
// "best effort", same trust level as the bot path.
exports.setOptIn = async (req, res) => {
    try {
        const whatsappRepository = require("./whatsapp.repository");
        await whatsappRepository.setWhatsAppOptIn(req.user.id, Boolean(req.body.enabled));
        return res.json({ success: true, message: "WhatsApp order updates preference saved" });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.verifyWebhook = (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
};

// Cloud API payload shape: entry[].changes[].value.messages[] - each
// message has `from` (phone, no leading "+") and, for a text message,
// `text.body`. Non-text messages (images, reactions, etc.) are
// acknowledged but not otherwise handled - the bot only understands
// numbered text replies.
exports.receiveMessage = async (req, res) => {
    // Acknowledge immediately - Meta expects a fast 200 regardless of
    // how long the actual reply takes to compute/send, and will retry
    // deliveries that time out.
    res.status(200).send("EVENT_RECEIVED");

    try {
        const entries = req.body?.entry || [];
        for (const entry of entries) {
            for (const change of entry.changes || []) {
                for (const message of change.value?.messages || []) {
                    if (message.type !== "text") continue;

                    const reply = await whatsappService.handleIncomingMessage(message.from, message.text?.body);
                    await whatsappProvider.sendText(message.from, reply);
                }
            }
        }
    } catch (error) {
        logger.error({ err: error }, "whatsapp inbound message handling error");
    }
};
