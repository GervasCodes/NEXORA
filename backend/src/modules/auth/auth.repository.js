const db = require("../../config/db");

exports.findByEmail = async (email) => {
    const [rows] = await db.query(
        "SELECT * FROM users WHERE email = ?",
        [email]
    );
    return rows[0];
};

exports.findById = async (id) => {
    const [rows] = await db.query(
        "SELECT * FROM users WHERE id = ?",
        [id]
    );
    return rows[0];
};

exports.findByPhone = async (phone) => {
    const [rows] = await db.query(
        "SELECT * FROM users WHERE phone = ?",
        [phone]
    );
    return rows[0];
};

// Deliberately narrow (columns needed for a primary-key lookup) -
// auth.middleware.js calls this on every authenticated request, so it
// needs to stay cheap. Exists so a deleted or suspended account's
// already-issued, still-unexpired token (7 days - see
// utils/generateToken.js) stops working immediately, the same way
// requireApprovedSeller.middleware.js never trusts the JWT for
// verification status either. suspended_at/suspension_reason let the
// middleware tell a suspension apart from other causes of is_active =
// FALSE and surface the reason on the full-screen suspended page.
exports.findAccountStatusById = async (id) => {
    const [rows] = await db.query(
        "SELECT is_active, deleted_at, suspended_at, suspension_reason, token_version, last_active_at FROM users WHERE id = ?",
        [id]
    );
    return rows[0];
};

// Revenue & Product Enhancements roadmap - "active users" metric.
// auth.middleware.js calls this (fire-and-forget, throttled) so
// last_active_at reflects real authenticated activity without adding a
// write to every single request. Deliberately swallows nothing here -
// the caller decides whether a failure should be logged; this is just
// the query.
exports.touchLastActive = async (id) => {
    await db.query("UPDATE users SET last_active_at = NOW() WHERE id = ?", [id]);
};

// Every function below takes an optional `conn` (a checked-out
// transaction connection from db.getConnection()). Pass one when the
// call needs to be part of an all-or-nothing transaction (registration);
// omit it to just use the shared pool like any other one-off query.
const runner = (conn) => conn || db;

exports.createUser = async (user, conn) => {
    const {
        first_name,
        last_name,
        email,
        phone,
        password,
        role,
        vehicle_type,
        vehicle_plate_number,
        terms_version
    } = user;

    // Seller/delivery_agent accounts start life needing verification;
    // every other role (buyer, admin) never needs it, so the gate is
    // simply never checked for them (see requireApprovedSeller /
    // requireApprovedDeliveryAgent middleware).
    const needsVerification = role === "seller" || role === "delivery_agent";

    // vehicle_type/vehicle_plate_number (migration 032) only ever arrive
    // for delivery_agent registrations - auth.validator.js requires both
    // when role === "delivery_agent" and every other role never sends
    // them, so they're simply NULL for buyer/seller/admin rows.
    //
    // terms_accepted_at is set to "now" here rather than trusted from the
    // client - auth.validator.js/auth.service.js have already confirmed
    // terms_accepted === true by the time this runs, so "now" IS the
    // moment of acceptance.
    const [result] = await runner(conn).query(
        `INSERT INTO users
        (first_name,last_name,email,phone,password,role,account_verification_status,account_verification_submitted_at,vehicle_type,vehicle_plate_number,terms_accepted_at,terms_version)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
            first_name,
            last_name,
            email,
            phone,
            password,
            role,
            needsVerification ? "pending" : "not_required",
            needsVerification ? new Date() : null,
            role === "delivery_agent" ? vehicle_type : null,
            role === "delivery_agent" ? (vehicle_plate_number || null) : null,
            new Date(),
            terms_version || null
        ]
    );

    return result.insertId;
};

exports.insertVerificationDocument = async (userId, documentType, fileUrl, conn) => {
    await runner(conn).query(
        "INSERT INTO account_verification_documents (user_id, document_type, file_url) VALUES (?, ?, ?)",
        [userId, documentType, fileUrl]
    );
};

exports.insertVerificationHistory = async (userId, action, reason, actorAdminId, conn) => {
    await runner(conn).query(
        "INSERT INTO account_verification_history (user_id, action, reason, actor_admin_id) VALUES (?, ?, ?, ?)",
        [userId, action, reason || null, actorAdminId || null]
    );
};
