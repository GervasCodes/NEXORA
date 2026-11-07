const db = require("../../config/db");

const TABLES = {
    verification: "account_verification_documents",
    kyc: "kyc_upgrade_requests"
};

exports.KINDS = Object.keys(TABLES);

exports.findDocument = async (kind, id) => {
    const table = TABLES[kind];
    if (!table) return null;

    const [rows] = await db.query(
        `SELECT id, user_id, file_url, file_public_id, file_resource_type, file_format,
                file_storage, file_purged_at
        FROM ${table} WHERE id = ?`,
        [id]
    );
    return rows[0] || null;
};
