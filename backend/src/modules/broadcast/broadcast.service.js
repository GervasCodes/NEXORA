const broadcastRepository = require("./broadcast.repository");
const sendEmail = require("../../utils/sendEmail");
const { renderEmail, absoluteUrl } = require("../../utils/emailTemplate");
const smsProvider = require("../sms/providers/sms.provider");
const whatsappProvider = require("../whatsapp/providers/whatsapp.provider");
// Reuses the same notification-creation + socket-emit path every other
// in-app notification in the app already goes through (see
// notification.service.js#notify) instead of a parallel mechanism, so
// a broadcast lands in NotificationBell.jsx instantly for anyone
// currently online, not just on next page load.
const notificationService = require("../notification/notification.service");
const auditService = require("../audit/audit.service");
const {
    BROADCAST_SEGMENTS, BROADCAST_CHANNELS, BROADCAST_TEMPLATE_TYPES, TEMPLATE_CHANNELS, IN_APP_MAX, MESSAGING_MAX
} = require("../../constants/broadcast");
const logger = require("../../utils/logger").child({ module: "broadcast" });

// In-app text is read as a short line in the notification bell, so a long
// shared body is trimmed to IN_APP_MAX (with an ellipsis) when reused there.
const trimForInApp = (text) => {
    const value = (text || "").trim();
    return value.length > IN_APP_MAX ? `${value.slice(0, IN_APP_MAX - 1).trimEnd()}…` : value;
};
exports.trimForInApp = trimForInApp;

const sameChannelSet = (a, b) => a.length === b.length && b.every((c) => a.includes(c));

const assertValidSegmentAndChannels = (segment, channels, templateType = "all") => {
    if (!BROADCAST_TEMPLATE_TYPES.includes(templateType)) {
        throw Object.assign(new Error(`Unknown broadcast type: ${templateType}`), { status: 400 });
    }

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

    // Channels are validated against the type: a WhatsApp + SMS broadcast
    // can never reach email or in-app, and an email + in-app broadcast can
    // never reach SMS or WhatsApp. 'messaging' and 'rich' are fixed sets.
    const allowed = TEMPLATE_CHANNELS[templateType];
    const notAllowed = channels.filter((c) => !allowed.includes(c));
    if (notAllowed.length) {
        throw Object.assign(
            new Error(`Channel(s) not allowed for this broadcast type: ${notAllowed.join(", ")}`),
            { status: 400 }
        );
    }
    if (templateType !== "all" && !sameChannelSet(channels, allowed)) {
        throw Object.assign(
            new Error(`This broadcast type always uses: ${allowed.join(" + ")}`),
            { status: 400 }
        );
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
//   - in_app: every recipient is eligible, no precondition - it's
//     their own account's notification feed, not an external contact
//     channel that can bounce or go unanswered.
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
    if (requestedChannels.includes("in_app")) {
        eligible.push("in_app");
    }

    return eligible;
};

// Each channel gets its own box in AdminBroadcast.jsx now (an SMS reads
// nothing like an email, and a WhatsApp message can be longer/richer
// than an SMS but shouldn't carry a full email's paragraphs either) -
// but an admin who only fills in the shared `message`/`subject` and
// ticks extra channels should still get something sensible sent rather
// than an empty SMS, so every per-channel field falls back to the
// shared one when left blank. Centralised here (rather than inlined in
// the send loop) so previewAudience-style callers and tests can reason
// about "what actually gets sent on channel X" in one place.
//
// Round 5 Phase 4 - per type:
//  - 'messaging': one plain text for WhatsApp and SMS, nothing else.
//  - 'rich': email subject + body; the in-app title is the subject and the
//    in-app text is the optional short text (default: the body, trimmed).
//  - 'all' (default): subject + one message everywhere; per-channel
//    overrides are still honoured when present (older rows / API callers).
//    The in-app message is always trimmed to IN_APP_MAX.
exports.resolveChannelContent = ({ templateType = "all", subject, message, smsMessage, whatsappMessage, inAppTitle, inAppMessage }) => {
    if (templateType === "messaging") {
        return { email: null, sms: message, whatsapp: message, inApp: null };
    }

    if (templateType === "rich") {
        return {
            email: { subject, message },
            sms: null,
            whatsapp: null,
            inApp: {
                title: subject,
                message: trimForInApp((inAppMessage && inAppMessage.trim()) || message)
            }
        };
    }

    return {
        email: { subject, message },
        sms: (smsMessage && smsMessage.trim()) || message,
        whatsapp: (whatsappMessage && whatsappMessage.trim()) || message,
        inApp: {
            title: (inAppTitle && inAppTitle.trim()) || subject || "Announcement",
            message: trimForInApp((inAppMessage && inAppMessage.trim()) || message)
        }
    };
};

// Split in two (Reliability phase): prepareBroadcast() does everything
// that must happen before an admin gets a response - validation, content
// resolution, recipient lookup, and creating the `broadcasts` row - and
// runSendLoop() does the actual per-recipient/per-channel sending.
// Previously these were one function that the HTTP handler awaited start
// to finish, which meant a broadcast to any real-sized segment (or one
// that landed right after a free-tier Render cold start) could run past
// the platform's request timeout and get killed mid-loop - silently
// dropping every send that hadn't been attempted yet, with no error
// surfaced anywhere. sendBroadcast() below still awaits both halves
// (unchanged behaviour, still used directly by resendBroadcast() and by
// every existing test); queueBroadcast() is the new entry point used by
// the HTTP route - it awaits only the prepare half and lets the send
// loop run in the background, so the response (and the row's existence)
// is never gated on how long the actual sending takes.
const prepareBroadcast = async ({
    adminId, segment, channels, subject, message, templateType = "all",
    smsMessage, whatsappMessage, inAppTitle, inAppMessage,
    // Set only by resendBroadcast() below - threaded through so the
    // audit entry for a resend says so and links back to the original,
    // instead of reading identically to a brand-new send.
    resentFromId
}) => {
    assertValidSegmentAndChannels(segment, channels, templateType);

    if (templateType === "messaging") {
        // Plain text only: no subject, none of the other channels' fields.
        subject = null;
        inAppTitle = null;
        inAppMessage = null;
        smsMessage = null;
        whatsappMessage = null;
    } else if (templateType === "rich") {
        smsMessage = null;
        whatsappMessage = null;
        inAppTitle = null;
        if (!subject || !subject.trim()) {
            throw Object.assign(new Error("A subject is required for an email + in-app broadcast"), { status: 400 });
        }
    } else if (channels.includes("email") && !subject) {
        throw Object.assign(new Error("A subject is required when sending by email"), { status: 400 });
    }

    if (!message || !message.trim()) {
        throw Object.assign(new Error("Message is required"), { status: 400 });
    }

    if (templateType === "messaging" && message.trim().length > MESSAGING_MAX) {
        throw Object.assign(new Error(`Message must be under ${MESSAGING_MAX} characters`), { status: 400 });
    }

    const content = exports.resolveChannelContent({ templateType, subject, message, smsMessage, whatsappMessage, inAppTitle, inAppMessage });

    const recipients = await broadcastRepository.findRecipientsBySegment(segment);

    // Row is created BEFORE sending (counts start at 0, filled in once the
    // loop ends) so its id can tag every outgoing email - Brevo echoes the
    // tag back on delivery webhooks, which is how delivered/bounced/spam
    // events get attributed to this broadcast (brevoWebhook.controller.js).
    const broadcastId = await broadcastRepository.create({
        adminId,
        segment,
        channels,
        templateType,
        subject,
        message,
        smsMessage: smsMessage || null,
        whatsappMessage: whatsappMessage || null,
        inAppTitle: inAppTitle || null,
        inAppMessage: inAppMessage || null,
        recipientCount: recipients.length
    });

    return {
        broadcastId, recipients, content, adminId, segment, channels, templateType, resentFromId
    };
};

// Every individual provider call is best-effort (mirrors notify()'s own
// treatment of email/WhatsApp sends elsewhere in the app) - one
// recipient's bounced email or invalid number must never stop the rest
// of a several-thousand-row segment from being messaged.
const runSendLoop = async ({ broadcastId, recipients, content, adminId, segment, channels, templateType, resentFromId }) => {
    let emailSentCount = 0;
    let smsSentCount = 0;
    let whatsappSentCount = 0;
    let inAppSentCount = 0;

    // try/finally so the counts of whatever DID go out are saved even if
    // something unexpected aborts the loop - the row already exists.
    try {
        for (const recipient of recipients) {
            const eligibleChannels = exports.resolveChannelsForRecipient(recipient, channels);

            for (const channel of eligibleChannels) {
                try {
                    if (channel === "email") {
                        // Previously called sendEmail() with no `html` arg, which
                        // falls back to utils/sendEmail.js's bare textToHtml()
                        // wrapper - a plain paragraph with none of the branded
                        // header, so the logo never appeared in a broadcast email
                        // even though every other transactional email (order
                        // updates, OTP) renders it via renderEmail(). Routed
                        // through the same renderEmail() template here so
                        // broadcasts match.
                        const rendered = renderEmail({
                            locale: recipient.language,
                            heading: content.email.subject,
                            message: content.email.message,
                            eyebrow: "ANNOUNCEMENT",
                            // Personalizes the greeting line when we have a
                            // name on file - see broadcast.repository.js and
                            // emailTemplate.js for why this matters beyond
                            // being a nice touch.
                            greetingName: recipient.first_name || undefined
                        });
                        // sendEmail({retry:false}) never throws - it swallows a
                        // failed send internally (see utils/sendEmail.js) so one
                        // bad address can't abort the loop. That used to mean
                        // this count went up unconditionally on every attempt,
                        // so a broadcast could show "email 500/500 sent" while
                        // every single one had actually failed at the provider.
                        // sendEmail now reports back whether it really went out,
                        // so only count it when it did.
                        // Bulk/marketing mail without a List-Unsubscribe header is
                        // exactly what Gmail (and Yahoo) use as a signal to file a
                        // message under Promotions/Updates instead of the Primary
                        // inbox - and Gmail's mobile app only pushes a notification
                        // for Primary by default, which is what "it sends now but
                        // arrives silently, you only see it in All Mail" describes.
                        // A plain mailto: unsubscribe address is a legitimate,
                        // recognised value for this header (RFC 2369) without
                        // needing a one-click HTTPS endpoint + suppression-list
                        // feature - a real "unsubscribe from broadcasts" feature
                        // (its own opt-out flag + enforcing it in
                        // resolveChannelsForRecipient) is a bigger follow-up, not
                        // done here.
                        const unsubscribeMailto = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM;
                        const broadcastHeaders = unsubscribeMailto
                            ? {
                                "List-Unsubscribe": `<mailto:${unsubscribeMailto}?subject=Unsubscribe>, <${absoluteUrl("/account")}>`
                            }
                            : undefined;
                        const delivered = await sendEmail(recipient.email, content.email.subject, rendered.text, rendered.html, {
                            retry: false,
                            headers: broadcastHeaders,
                            toName: recipient.first_name || undefined,
                            tags: [`broadcast-${broadcastId}`]
                        });
                        if (delivered) {
                            emailSentCount += 1;
                        }
                    } else if (channel === "sms") {
                        await smsProvider.sendText(recipient.phone, content.sms);
                        smsSentCount += 1;
                    } else if (channel === "whatsapp") {
                        await whatsappProvider.sendText(recipient.phone, content.whatsapp);
                        whatsappSentCount += 1;
                    } else if (channel === "in_app") {
                        await notificationService.notify({
                            userId: recipient.id,
                            type: "broadcast",
                            title: content.inApp.title,
                            message: content.inApp.message
                        });
                        inAppSentCount += 1;
                    }
                } catch (error) {
                    logger.warn({ err: error, recipientId: recipient.id, channel }, "broadcast send error for one recipient");
                }
            }
        }
    } finally {
        await broadcastRepository.updateSentCounts(broadcastId, {
            emailSentCount, smsSentCount, whatsappSentCount, inAppSentCount
        });
    }

    auditService.log({
        userId: adminId,
        eventType: "broadcast_sent",
        description: resentFromId
            ? `Broadcast resent to ${segment} (${recipients.length} recipients, resend of #${resentFromId})`
            : `Broadcast sent to ${segment} (${recipients.length} recipients)`,
        metadata: {
            broadcastId, segment, channels, templateType, recipientCount: recipients.length,
            emailSentCount, smsSentCount, whatsappSentCount, inAppSentCount,
            ...(resentFromId ? { resentFromId } : {})
        }
    });

    return {
        broadcastId,
        segment,
        recipientCount: recipients.length,
        emailSentCount,
        smsSentCount,
        whatsappSentCount,
        inAppSentCount,
        ...(resentFromId ? { resentFromId } : {})
    };
};

// Unchanged public behaviour: prepares AND fully sends before resolving.
// Used directly by resendBroadcast() below and by every existing test -
// nothing about what this returns or when it resolves has changed.
exports.sendBroadcast = async (params) => {
    const prepared = await prepareBroadcast(params);
    return runSendLoop(prepared);
};

// New entry point for the HTTP route (see broadcast.controller.js#send):
// awaits only validation + row creation, then lets the actual send loop
// run in the background instead of blocking the response on it. A
// failure inside the loop itself is still logged (it already updates
// the row's counts and writes the audit log in its own `finally`/normal
// path) - there's just no HTTP response left waiting on it.
exports.queueBroadcast = async (params) => {
    const prepared = await prepareBroadcast(params);
    runSendLoop(prepared).catch((error) => {
        logger.error({ err: error, broadcastId: prepared.broadcastId }, "broadcast send loop failed unexpectedly");
    });
    return {
        broadcastId: prepared.broadcastId,
        segment: prepared.segment,
        recipientCount: prepared.recipients.length,
        status: "sending"
    };
};

exports.getHistory = async ({ type } = {}) => {
    if (type && !BROADCAST_TEMPLATE_TYPES.includes(type)) {
        throw Object.assign(new Error(`Unknown broadcast type: ${type}`), { status: 400 });
    }
    return broadcastRepository.findAll({ limit: 50, type: type || null });
};

// Soft delete - see broadcast.repository.js#softDelete and migration
// 141 for why this hides rather than destroys the row.
exports.deleteBroadcast = async (id) => {
    const removed = await broadcastRepository.softDelete(id);
    if (!removed) {
        throw Object.assign(new Error("Broadcast not found"), { status: 404 });
    }
};

// Resends a past broadcast's exact stored content (subject/message and
// any per-channel overrides) through the normal sendBroadcast() path -
// not a copy of its send loop - so eligibility rules, per-channel
// fallback and history recording all stay in the one place this file
// already tests. The audience is re-resolved from the segment fresh
// (not the original recipient list), so anyone who joined since the
// original send gets it and anyone deactivated since doesn't. Writes
// its OWN new `broadcasts` row - the original is left exactly as it
// was sent, and the resend shows up as its own entry in history.
exports.resendBroadcast = async (id, adminId) => {
    const original = await broadcastRepository.findById(id);
    if (!original) {
        throw Object.assign(new Error("Broadcast not found"), { status: 404 });
    }

    return exports.sendBroadcast({
        adminId,
        segment: original.segment,
        channels: original.channels.split(","),
        templateType: original.template_type || "all",
        subject: original.subject,
        message: original.message,
        smsMessage: original.sms_message,
        whatsappMessage: original.whatsapp_message,
        inAppTitle: original.in_app_title,
        inAppMessage: original.in_app_message,
        resentFromId: original.id
    });
};

// Background-send counterpart to resendBroadcast(), for the same reason
// queueBroadcast() exists above - used by broadcast.controller.js#resend.
exports.queueResendBroadcast = async (id, adminId) => {
    const original = await broadcastRepository.findById(id);
    if (!original) {
        throw Object.assign(new Error("Broadcast not found"), { status: 404 });
    }

    return exports.queueBroadcast({
        adminId,
        segment: original.segment,
        channels: original.channels.split(","),
        templateType: original.template_type || "all",
        subject: original.subject,
        message: original.message,
        smsMessage: original.sms_message,
        whatsappMessage: original.whatsapp_message,
        inAppTitle: original.in_app_title,
        inAppMessage: original.in_app_message,
        resentFromId: original.id
    });
};
