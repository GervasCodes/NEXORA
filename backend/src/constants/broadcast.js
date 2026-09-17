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

exports.BROADCAST_CHANNELS = ["email", "sms", "whatsapp"];
