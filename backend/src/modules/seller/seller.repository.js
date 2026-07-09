const db = require("../../config/db");

// Find Seller by User ID
exports.findByUserId = async (userId) => {

    const [rows] = await db.query(
        `SELECT sp.*, st.name AS store_type_name
        FROM seller_profiles sp
        LEFT JOIN store_types st ON st.id = sp.store_type_id
        WHERE sp.user_id = ?`,
        [userId]
    );

    return rows[0];
};

// Create Seller Profile
exports.create = async (sellerData) => {

    const {
        user_id,
        store_name,
        store_slug,
        store_description,
        store_type_id
    } = sellerData;

    const [result] = await db.query(
        `INSERT INTO seller_profiles
        (user_id, store_name, store_slug, store_description, store_type_id)
        VALUES (?, ?, ?, ?, ?)`,
        [
            user_id,
            store_name,
            store_slug,
            store_description,
            store_type_id || null
        ]
    );

    return result.insertId;
};

// Update Seller Profile
exports.update = async (userId, data) => {

    const fields = [];
    const params = [];

    const allowed = [
        "store_name", "store_description", "business_email",
        "business_phone", "country", "region", "city", "address", "store_type_id"
    ];

    for (const key of allowed) {
        if (data[key] !== undefined) {
            fields.push(`${key} = ?`);
            params.push(data[key]);
        }
    }

    if (fields.length === 0) return;

    params.push(userId);

    await db.query(
        `UPDATE seller_profiles SET ${fields.join(", ")} WHERE user_id = ?`,
        params
    );
};

exports.updateLogo = async (userId, logoUrl) => {
    await db.query(
        "UPDATE seller_profiles SET store_logo = ? WHERE user_id = ?",
        [logoUrl, userId]
    );
};

exports.updateBanner = async (userId, bannerUrl) => {
    await db.query(
        "UPDATE seller_profiles SET store_banner = ? WHERE user_id = ?",
        [bannerUrl, userId]
    );
};
// --- Seller's own delivery agent roster (their hired staff) ---

exports.findAgentByEmail = async (email) => {
    const [rows] = await db.query(
        "SELECT id, first_name, last_name, email, role FROM users WHERE email = ?",
        [email]
    );
    return rows[0];
};

exports.findRoster = async (sellerId) => {
    const [rows] = await db.query(
        `SELECT sda.id, sda.agent_id, sda.created_at,
                u.first_name, u.last_name, u.email
        FROM seller_delivery_agents sda
        JOIN users u ON u.id = sda.agent_id
        WHERE sda.seller_id = ?
        ORDER BY sda.created_at DESC`,
        [sellerId]
    );
    return rows;
};

exports.isInRoster = async (sellerId, agentId) => {
    const [rows] = await db.query(
        "SELECT id FROM seller_delivery_agents WHERE seller_id = ? AND agent_id = ?",
        [sellerId, agentId]
    );
    return rows.length > 0;
};

exports.addToRoster = async (sellerId, agentId) => {
    const [result] = await db.query(
        "INSERT INTO seller_delivery_agents (seller_id, agent_id) VALUES (?, ?)",
        [sellerId, agentId]
    );
    return result.insertId;
};

exports.removeFromRoster = async (sellerId, agentId) => {
    const [result] = await db.query(
        "DELETE FROM seller_delivery_agents WHERE seller_id = ? AND agent_id = ?",
        [sellerId, agentId]
    );
    return result.affectedRows;
};
