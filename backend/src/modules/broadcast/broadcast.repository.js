const db = require("../../config/db");
const { SEGMENT_ROLES } = require("../../constants/broadcast");

// The actual audience resolution query. Only active accounts (matches
// every other "who should we reach" query in the app - e.g. Phase 4's
// active-users view) - a deactivated account shouldn't get a marketing/
// announcement message it likely can't even act on.
//
// whatsapp_order_updates is pulled through even though its name is
// order-update-specific: it's the only WhatsApp opt-in flag that exists
// today, and broadcast.service.js reuses it as the WhatsApp-eligibility
// check for THIS channel too rather than sending WhatsApp with no
// consent signal at all. See that file's comment for the full
// reasoning and the follow-up this leaves open.
//
// first_name is pulled through so the broadcast email can greet the
// recipient by name (see broadcast.service.js) instead of reading as
// generic, identical-to-everyone bulk mail - one of the things mail
// clients weigh when deciding whether to file a message under
// Promotions/Updates (silent, no push notification) instead of Primary.
exports.findRecipientsBySegment = async (segment) => {
    const roles = SEGMENT_ROLES[segment];

    if (!roles) {
        throw Object.assign(new Error(`Unknown broadcast segment: ${segment}`), { status: 400 });
    }

    const [rows] = await db.query(
        `SELECT id, email, phone, language, whatsapp_order_updates, first_name
        FROM users
        WHERE role IN (?) AND is_active = TRUE`,
        [roles]
    );

    return rows;
};

// Cheap count-only version for the "N recipients" preview the
// composition UI shows before actually sending - avoids pulling every
// contact column just to show a number.
exports.countRecipientsBySegment = async (segment) => {
    const roles = SEGMENT_ROLES[segment];

    if (!roles) {
        throw Object.assign(new Error(`Unknown broadcast segment: ${segment}`), { status: 400 });
    }

    const [rows] = await db.query(
        "SELECT COUNT(*) AS count FROM users WHERE role IN (?) AND is_active = TRUE",
        [roles]
    );

    return rows[0].count;
};

exports.create = async ({
    adminId, segment, channels, templateType = "all", subject, message,
    smsMessage, whatsappMessage, inAppTitle, inAppMessage,
    // Counts default to 0: sendBroadcast creates the row BEFORE sending (so
    // its id can tag the outgoing email) and fills the real counts in
    // afterwards via updateSentCounts().
    recipientCount, emailSentCount = 0, smsSentCount = 0, whatsappSentCount = 0, inAppSentCount = 0
}) => {
    const [result] = await db.query(
        `INSERT INTO broadcasts
        (admin_id, segment, channels, template_type, subject, message, sms_message, whatsapp_message, in_app_title, in_app_message, recipient_count, email_sent_count, sms_sent_count, whatsapp_sent_count, in_app_sent_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            adminId, segment, channels.join(","), templateType, subject || null, message,
            smsMessage || null, whatsappMessage || null, inAppTitle || null, inAppMessage || null,
            recipientCount, emailSentCount, smsSentCount, whatsappSentCount, inAppSentCount || 0
        ]
    );
    return result.insertId;
};

exports.updateSentCounts = async (id, { emailSentCount, smsSentCount, whatsappSentCount, inAppSentCount }) => {
    await db.query(
        `UPDATE broadcasts
        SET email_sent_count = ?, sms_sent_count = ?, whatsapp_sent_count = ?, in_app_sent_count = ?
        WHERE id = ?`,
        [emailSentCount, smsSentCount, whatsappSentCount, inAppSentCount, id]
    );
};

// `type` (optional) filters history to one broadcast function: 'all',
// 'messaging' or 'rich'. Rows from before migration 149 are 'all'.
exports.findAll = async ({ limit = 50, type = null } = {}) => {
    const [rows] = await db.query(
        `SELECT b.*, u.first_name AS admin_first_name, u.last_name AS admin_last_name
        FROM broadcasts b
        JOIN users u ON u.id = b.admin_id
        WHERE b.deleted_at IS NULL
          AND (? IS NULL OR b.template_type = ?)
        ORDER BY b.created_at DESC
        LIMIT ?`,
        [type, type, limit]
    );
    return rows;
};

// Single-row lookup backing both the delete-ownership check and resend
// (resend needs the full stored content - subject/message/per-channel
// bodies - not just the summary findAll's callers have historically
// needed).
exports.findById = async (id) => {
    const [rows] = await db.query(
        `SELECT b.*, u.first_name AS admin_first_name, u.last_name AS admin_last_name
        FROM broadcasts b
        JOIN users u ON u.id = b.admin_id
        WHERE b.id = ? AND b.deleted_at IS NULL`,
        [id]
    );
    return rows[0] || null;
};

// Soft delete only - see migration 141_broadcasts_soft_delete.sql for
// why this table is never hard-deleted from. Scoped to
// `deleted_at IS NULL` so calling this twice on the same id is a no-op
// the second time (affectedRows: 0), which the service layer reads as
// "already gone" / 404 rather than silently succeeding again.
exports.softDelete = async (id) => {
    const [result] = await db.query(
        "UPDATE broadcasts SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL",
        [id]
    );
    return result.affectedRows > 0;
};

// --- Brevo delivery-status webhook ---
// broadcastId is parsed from the `broadcast-<id>` tag sendBroadcast puts on
// every outgoing email (see brevoWebhook.controller.js); NULL for
// transactional mail and for events from before migration 153.
exports.recordDeliveryEvent = async ({ eventType, recipientEmail, brevoMessageId, broadcastId = null, rawEvent }) => {
    await db.query(
        `INSERT INTO email_delivery_events (event_type, recipient_email, brevo_message_id, broadcast_id, raw_event)
        VALUES (?, ?, ?, ?, ?)`,
        [eventType, recipientEmail, brevoMessageId || null, broadcastId, rawEvent ? JSON.stringify(rawEvent) : null]
    );
};
