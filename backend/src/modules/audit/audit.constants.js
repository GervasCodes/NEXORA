// Phase 5 - Audit Logs. Every event_type ever written via
// audit.service.js#log/logFromRequest, grouped the way the admin panel's
// filter dropdown presents them. A group name doubles as the `category`
// query param accepted by GET /admin/audit-logs (see admin.controller.js).
//
// Kept as a flat lookup (not derived from a DB query) since the set of
// event types is small and fixed by the code that emits them - a
// `SELECT DISTINCT event_type` would also miss types that exist in code
// but haven't fired yet in this environment.
const EVENT_TYPE_GROUPS = {
    account: [
        "account_suspended",
        "account_unsuspended",
        "account_permanently_deleted",
        "user_account_deleted",
        "user_registered"
    ],
    admin: [
        "admin_account_created",
        "admin_permissions_changed",
        "admin_account_deleted"
    ],
    auth: ["login_success", "login_failed"],
    orders: ["order_created", "order_delivery_manually_assigned"],
    payments: ["payment_processed"],
    refunds: [
        "refund.completed",
        "refund.failed",
        "refund.manual_required",
        "refund.duplicate_trigger_skipped",
        "refund.triggered",
        "refund.manual_retry"
    ]
};

module.exports = { EVENT_TYPE_GROUPS };
