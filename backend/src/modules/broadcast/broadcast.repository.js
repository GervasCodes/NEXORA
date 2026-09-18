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
exports.findRecipientsBySegment = async (segment) => {
    const roles = SEGMENT_ROLES[segment];

    if (!roles) {
        throw Object.assign(new Error(`Unknown broadcast segment: ${segment}`), { status: 400 });
    }

    const [rows] = await db.query(
        `SELECT id, email, phone, language, whatsapp_order_updates
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

exports.create = async ({ adminId, segment, channels, subject, message, recipientCount, emailSentCount, smsSentCount, whatsappSentCount }) => {
    const [result] = await db.query(
        `INSERT INTO broadcasts
        (admin_id, segment, channels, subject, message, recipient_count, email_sent_count, sms_sent_count, whatsapp_sent_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [adminId, segment, channels.join(","), subject || null, message, recipientCount, emailSentCount, smsSentCount, whatsappSentCount]
    );
    return result.insertId;
};

exports.findAll = async ({ limit = 50 } = {}) => {
    const [rows] = await db.query(
        `SELECT b.*, u.first_name AS admin_first_name, u.last_name AS admin_last_name
        FROM broadcasts b
        JOIN users u ON u.id = b.admin_id
        ORDER BY b.created_at DESC
        LIMIT ?`,
        [limit]
    );
    return rows;
};

// --- Brevo delivery-status webhook (Phase 5, production error fixes) ---
// Deliberately NOT attributed to a specific `broadcasts` row - see
// database/migrations/111_broadcast_delivery_events.sql for why (real
// per-broadcast attribution needs outgoing mail tagged with a
// broadcast id at send time, which would require reordering
// broadcast.service.js#sendBroadcast to create its row before sending
// rather than after, and updating that function's existing test to
// match - flagged in PHASE_5_NOTES.md as a follow-up rather than done
// silently here). This just records that Brevo told us what happened
// to a given send, system-wide.
exports.recordDeliveryEvent = async ({ eventType, recipientEmail, brevoMessageId, rawEvent }) => {
    await db.query(
        `INSERT INTO email_delivery_events (event_type, recipient_email, brevo_message_id, raw_event)
        VALUES (?, ?, ?, ?)`,
        [eventType, recipientEmail, brevoMessageId || null, rawEvent ? JSON.stringify(rawEvent) : null]
    );
};
