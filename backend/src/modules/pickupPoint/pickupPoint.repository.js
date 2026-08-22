const db = require("../../config/db");

exports.findActive = async ({ region, city } = {}) => {
    const conditions = ["is_active = 1"];
    const params = [];

    if (region) {
        conditions.push("region = ?");
        params.push(region);
    }
    if (city) {
        conditions.push("city = ?");
        params.push(city);
    }

    const [rows] = await db.query(
        `SELECT * FROM pickup_points WHERE ${conditions.join(" AND ")} ORDER BY name ASC`,
        params
    );
    return rows;
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM pickup_points WHERE id = ?", [id]);
    return rows[0];
};

exports.findAll = async () => {
    const [rows] = await db.query("SELECT * FROM pickup_points ORDER BY created_at DESC");
    return rows;
};

exports.create = async ({ name, address, city, region, latitude, longitude, contactPhone, operatingHours }) => {
    const [result] = await db.query(
        `INSERT INTO pickup_points (name, address, city, region, latitude, longitude, contact_phone, operating_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, address, city, region, latitude ?? null, longitude ?? null, contactPhone || null, operatingHours || null]
    );
    return result.insertId;
};

exports.update = async (id, fields) => {
    const columns = {
        name: "name", address: "address", city: "city", region: "region",
        latitude: "latitude", longitude: "longitude",
        contactPhone: "contact_phone", operatingHours: "operating_hours",
        isActive: "is_active"
    };

    const sets = [];
    const params = [];

    for (const [key, column] of Object.entries(columns)) {
        if (fields[key] !== undefined) {
            sets.push(`${column} = ?`);
            params.push(key === "isActive" ? (fields[key] ? 1 : 0) : fields[key]);
        }
    }

    if (sets.length === 0) return;

    params.push(id);
    await db.query(`UPDATE pickup_points SET ${sets.join(", ")} WHERE id = ?`, params);
};
