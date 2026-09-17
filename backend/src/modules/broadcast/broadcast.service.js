const broadcastRepository = require("./broadcast.repository");
const sendEmail = require("../../utils/sendEmail");
const smsProvider = require("../sms/providers/sms.provider");
const whatsappProvider = require("../whatsapp/providers/whatsapp.provider");
const auditService = require("../audit/audit.service");
const { BROADCAST_SEGMENTS, BROADCAST_CHANNELS } = require("../../constants/broadcast");
const logger = require("../../utils/logger").child({ module: "broadcast" });

const assertValidSegmentAndChannels = (segment, channels) => {
    if (!BROADCAST_SEGMENTS.includes(segment)) {
        throw Object.assign(new Error(`Unknown segment: ${segment}`), { status: 400 });
    }

    if (!Array.isArray(channels) || channels.length === 0) {
        throw Object.assign(new Error("At least one channel is required"), { status: 400 });
    }

    const invalid = channels.filter((c) => !BROADCAST_CHANNELS.includes(c));
    if (invalid.length) {
        throw Object.assign(new Error(`Unknown channel(s): ${invalid.join(", ")}`), { status: 400 });
    }
};

// The part Phase 9 calls out for tests: which segment resolves to how
// many/which recipients. Exported on its own (rather than only living
// inside sendBroadcast) so the composition UI's "this will reach ~N
// people" preview, and the tests, can call it without actually sending
// anything.
exports.previewAudience = async (segment) => {
    if (!BROADCAST_SEGMENTS.includes(segment)) {
        throw Object.assign(new Error(`Unknown segment: ${segment}`), { status: 400 });
    }

    const recipientCount = await broadcastRepository.countRecipientsBySegment(segment);
    return { segment, recipientCount };
};

// Per-recipient, per-channel eligibility - not just "does a channel
// appear in the requested list", but "can/should THIS recipient
// actually get it on that channel":
//   - email: needs an email on file (every user has one - unique/NOT
//     NULL on users.email - so this is really just future-proofing).
//   - sms: needs a phone on file (also NOT NULL/unique today, same
//     reasoning).
//   - whatsapp: needs a phone AND the existing whatsapp_order_updates
//     opt-in flag - reused here as this channel's consent signal since
//     no broadcast-specific opt-in exists yet (a real product surface
//     for "WhatsApp marketing opt-in" distinct from "WhatsApp order
//     updates" is a reasonable follow-up, not built in this phase).
// Exported so the audience-resolution tests can exercise this in
// isolation from the actual send loop below.
exports.resolveChannelsForRecipient = (recipient, requestedChannels) => {
    const eligible = [];

    if (requestedChannels.includes("email") && recipient.email) {
        eligible.push("email");
    }
    if (requestedChannels.includes("sms") && recipient.phone) {
        eligible.push("sms");
    }
    if (requestedChannels.includes("whatsapp") && recipient.phone && recipient.whatsapp_order_updates) {
        eligible.push("whatsapp");
    }

    return eligible;
};

// Every individual provider call is best-effort (mirrors notify()'s own
// treatment of email/WhatsApp sends elsewhere in the app) - one
// recipient's bounced email or invalid number must never stop the rest
// of a several-thousand-row segment from being messaged.
exports.sendBroadcast = async ({ adminId, segment, channels, subject, message }) => {
    assertValidSegmentAndChannels(segment, channels);

    if (channels.includes("email") && !subject) {
        throw Object.assign(new Error("A subject is required when sending by email"), { status: 400 });
    }

    if (!message || !message.trim()) {
        throw Object.assign(new Error("Message is required"), { status: 400 });
    }

    const recipients = await broadcastRepository.findRecipientsBySegment(segment);

    let emailSentCount = 0;
    let smsSentCount = 0;
    let whatsappSentCount = 0;

    for (const recipient of recipients) {
        const eligibleChannels = exports.resolveChannelsForRecipient(recipient, channels);

        for (const channel of eligibleChannels) {
            try {
                if (channel === "email") {
                    await sendEmail(recipient.email, subject, message);
                    emailSentCount += 1;
                } else if (channel === "sms") {
                    await smsProvider.sendText(recipient.phone, message);
                    smsSentCount += 1;
                } else if (channel === "whatsapp") {
                    await whatsappProvider.sendText(recipient.phone, message);
                    whatsappSentCount += 1;
                }
            } catch (error) {
                logger.warn({ err: error, recipientId: recipient.id, channel }, "broadcast send error for one recipient");
            }
        }
    }

    const broadcastId = await broadcastRepository.create({
        adminId,
        segment,
        channels,
        subject,
        message,
        recipientCount: recipients.length,
        emailSentCount,
        smsSentCount,
        whatsappSentCount
    });

    auditService.log({
        userId: adminId,
        eventType: "broadcast_sent",
        description: `Broadcast sent to ${segment} (${recipients.length} recipients)`,
        metadata: { broadcastId, segment, channels, recipientCount: recipients.length, emailSentCount, smsSentCount, whatsappSentCount }
    });

    return {
        broadcastId,
        segment,
        recipientCount: recipients.length,
        emailSentCount,
        smsSentCount,
        whatsappSentCount
    };
};

exports.getHistory = async () => broadcastRepository.findAll({ limit: 50 });
