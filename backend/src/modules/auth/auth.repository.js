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
        role
    } = user;

    // Seller/delivery_agent accounts start life needing verification;
    // every other role (buyer, admin) never needs it, so the gate is
    // simply never checked for them (see requireApprovedSeller /
    // requireApprovedDeliveryAgent middleware).
    const needsVerification = role === "seller" || role === "delivery_agent";

    const [result] = await runner(conn).query(
        `INSERT INTO users
        (first_name,last_name,email,phone,password,role,account_verification_status,account_verification_submitted_at)
        VALUES (?,?,?,?,?,?,?,?)`,
        [
            first_name,
            last_name,
            email,
            phone,
            password,
            role,
            needsVerification ? "pending" : "not_required",
            needsVerification ? new Date() : null
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
