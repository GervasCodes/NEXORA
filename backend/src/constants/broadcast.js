// Admin broadcast (Phase 9). 'everyone' means every non-admin role
// (buyer + seller + delivery_agent) - admins get the existing shared
// admin_notifications feed (adminNotification module) for internal
// announcements, not this customer/partner-facing broadcast tool.
exports.BROADCAST_SEGMENTS = ["all_sellers", "all_buyers", "all_delivery_agents", "everyone"];

// Maps each segment to the users.role value(s) it targets - the one
// place that mapping lives, so broadcast.repository.js#findRecipientsBySegment
// and any future segment (e.g. a "sellers with X" filter) both read off
// this instead of duplicating the role list.
exports.SEGMENT_ROLES = {
    all_sellers: ["seller"],
    all_buyers: ["buyer"],
    all_delivery_agents: ["delivery_agent"],
    everyone: ["buyer", "seller", "delivery_agent"]
};

// "in_app" (Fix Plan Phase 1.2): lands the broadcast in the
// recipient's own NotificationBell.jsx feed via the existing
// notification.service.js#notify() path - see broadcast.service.js.
// Unlike email/sms/whatsapp it needs no contact-info precondition,
// so it's eligible for every recipient (see
// resolveChannelsForRecipient in broadcast.service.js).
exports.BROADCAST_CHANNELS = ["email", "sms", "whatsapp", "in_app"];

// Round 5 Phase 4: three completely separate broadcast functions, each
// with its own channels. 'all' = email + SMS + WhatsApp + in-app from one
// subject + one message; 'messaging' = WhatsApp + SMS only (plain text, no
// subject); 'rich' = email + in-app only (subject + rich body, optional
// short in-app text). Rows created before this existed are 'all'.
exports.BROADCAST_TEMPLATE_TYPES = ["all", "messaging", "rich"];

// The channels each type may use. 'messaging' and 'rich' are fixed: the
// request must name exactly these channels. 'all' may use any subset (kept
// permissive so older callers and resends of older rows keep working).
exports.TEMPLATE_CHANNELS = {
    all: ["email", "sms", "whatsapp", "in_app"],
    messaging: ["whatsapp", "sms"],
    rich: ["email", "in_app"]
};

// Longest in-app notification text. Longer broadcast bodies are trimmed to
// this (with an ellipsis) when they are reused as the in-app message. Keep
// in sync with IN_APP_MAX in frontend/src/pages/admin/AdminBroadcast.jsx.
exports.IN_APP_MAX = 1000;

// A WhatsApp + SMS broadcast is one plain text sent on both; the cap is the
// WhatsApp one (SMS is split into segments by the gateway).
exports.MESSAGING_MAX = 1000;
