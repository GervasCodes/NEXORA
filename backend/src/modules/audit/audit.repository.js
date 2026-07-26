const db = require("../../config/db");

exports.insertLog = async ({ userId, eventType, description, ipAddress, metadata }) => {
    await db.query(
        `INSERT INTO audit_logs (user_id, event_type, description, ip_address, metadata)
        VALUES (?, ?, ?, ?, ?)`,
        [
            userId || null,
            eventType,
            description || null,
            ipAddress || null,
            metadata ? JSON.stringify(metadata) : null
        ]
    );
};

// Used by the admin panel (see admin.repository.js pattern) to page
// through recent events, optionally filtered to one event type or user.
// Kept around (rather than folded into search below) since it's the
// simple, unpaginated shape a couple of call sites may still want.
exports.findRecent = async ({ eventType, userId, limit = 100 } = {}) => {
    const conditions = [];
    const params = [];

    if (eventType) {
        conditions.push("event_type = ?");
        params.push(eventType);
    }
    if (userId) {
        conditions.push("user_id = ?");
        params.push(userId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(Number(limit));

    const [rows] = await db.query(
        `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ?`,
        params
    );
    return rows;
};

// Phase 5 - Audit Logs admin page. Same table as findRecent above, but
// with the filtering/search/pagination the search+filters requirement
// needs: one or more event types (a "category" of events, e.g. every
// suspension-related type at once), the acting user, a date range, free
// text (matches the description, the actor's name/email, or anything in
// the metadata JSON - e.g. a target user's id or a suspension reason),
// and page/pageSize the same way review.repository.js#findBySeller
// paginates. Joined to users for the actor's display name/email/role
// since audit_logs itself only stores user_id - LEFT JOIN (not JOIN) so
// a log entry for a since-deleted actor (ON DELETE SET NULL, see
// migration 035) still shows up rather than disappearing.
exports.search = async ({
    eventTypes,
    userId,
    dateFrom,
    dateTo,
    q,
    adminActorsOnly,
    page = 1,
    pageSize = 25
} = {}) => {
    const conditions = [];
    const params = [];

    if (eventTypes && eventTypes.length) {
        conditions.push(`al.event_type IN (${eventTypes.map(() => "?").join(", ")})`);
        params.push(...eventTypes);
    }
    if (userId) {
        conditions.push("al.user_id = ?");
        params.push(Number(userId));
    }
    if (dateFrom) {
        conditions.push("al.created_at >= ?");
        params.push(dateFrom);
    }
    if (dateTo) {
        conditions.push("al.created_at <= ?");
        params.push(dateTo);
    }
    // Actions performed BY an admin/super_admin - suspensions, deletions,
    // permission changes, and admin logins are all attributable to the
    // acting user's role, so this is how the admin panel narrows down to
    // "admin logins/actions" specifically rather than every event type.
    if (adminActorsOnly) {
        conditions.push("u.role = 'admin'");
    }
    if (q && q.trim()) {
        conditions.push(
            `(al.description LIKE ?
              OR CONCAT(u.first_name, ' ', u.last_name) LIKE ?
              OR u.email LIKE ?
              OR CAST(al.metadata AS CHAR) LIKE ?)`
        );
        const like = `%${q.trim()}%`;
        params.push(like, like, like, like);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ${where}`,
        params
    );

    const currentPage = Math.max(1, Number(page) || 1);
    const size = Math.min(100, Math.max(1, Number(pageSize) || 25));
    const offset = (currentPage - 1) * size;

    const [rows] = await db.query(
        `SELECT al.id, al.user_id, al.event_type, al.description, al.ip_address,
                al.metadata, al.created_at,
                u.first_name AS actor_first_name, u.last_name AS actor_last_name,
                u.email AS actor_email, u.role AS actor_role
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ${where}
        ORDER BY al.created_at DESC
        LIMIT ? OFFSET ?`,
        [...params, size, offset]
    );

    return { rows, total, page: currentPage, totalPages: Math.max(1, Math.ceil(total / size)) };
};
