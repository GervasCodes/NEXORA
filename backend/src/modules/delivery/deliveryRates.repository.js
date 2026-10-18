const db = require("../../config/db");

// ---- Rate cards ------------------------------------------------------------

// The card in force for a vehicle at `asOf`: newest row whose effective_from
// has passed.
exports.findCurrentCard = async (vehicleType, asOf = new Date()) => {
    const [rows] = await db.query(
        `SELECT id, vehicle_type, fuel_product, min_fee, per_km_rate, effective_from
        FROM delivery_rate_cards
        WHERE vehicle_type = ? AND effective_from <= ?
        ORDER BY effective_from DESC, id DESC
        LIMIT 1`,
        [vehicleType, asOf]
    );
    return rows[0] || null;
};

exports.listCards = async (limit = 100) => {
    const [rows] = await db.query(
        `SELECT c.id, c.vehicle_type, c.fuel_product, c.min_fee, c.per_km_rate, c.effective_from, c.created_at,
                u.first_name, u.last_name
        FROM delivery_rate_cards c
        LEFT JOIN users u ON u.id = c.created_by
        ORDER BY c.effective_from DESC, c.id DESC
        LIMIT ?`,
        [Number(limit)]
    );
    return rows;
};

exports.insertCard = async ({ vehicleType, fuelProduct, minFee, perKmRate, effectiveFrom, createdBy }) => {
    const [result] = await db.query(
        `INSERT INTO delivery_rate_cards (vehicle_type, fuel_product, min_fee, per_km_rate, effective_from, created_by)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [vehicleType, fuelProduct, minFee, perKmRate, effectiveFrom, createdBy]
    );
    return result.insertId;
};

// ---- Fuel reference --------------------------------------------------------

// Newest two cap rows (current, then previous) for a region/product at asOf.
exports.findFuelRows = async (region, product, asOf = new Date()) => {
    const [rows] = await db.query(
        `SELECT id, region, product, cap_price, effective_from
        FROM fuel_reference
        WHERE LOWER(region) = LOWER(?) AND product = ? AND effective_from <= ?
        ORDER BY effective_from DESC, id DESC
        LIMIT 2`,
        [region, product, asOf]
    );
    return rows;
};

exports.listFuel = async (limit = 100) => {
    const [rows] = await db.query(
        `SELECT f.id, f.region, f.product, f.cap_price, f.effective_from, f.created_at,
                u.first_name, u.last_name
        FROM fuel_reference f
        LEFT JOIN users u ON u.id = f.entered_by
        ORDER BY f.effective_from DESC, f.id DESC
        LIMIT ?`,
        [Number(limit)]
    );
    return rows;
};

exports.insertFuel = async ({ region, product, capPrice, effectiveFrom, enteredBy }) => {
    const [result] = await db.query(
        `INSERT INTO fuel_reference (region, product, cap_price, effective_from, entered_by)
        VALUES (?, ?, ?, ?, ?)`,
        [region, product, capPrice, effectiveFrom, enteredBy]
    );
    return result.insertId;
};

// ---- ETA adjustments -------------------------------------------------------

exports.findActiveAdjustments = async (region) => {
    const [rows] = await db.query(
        `SELECT id, region, label, start_hour, end_hour, multiplier, buffer_minutes, is_active
        FROM delivery_eta_adjustments
        WHERE is_active = 1 AND LOWER(region) = LOWER(?)`,
        [region]
    );
    return rows;
};

exports.listAdjustments = async () => {
    const [rows] = await db.query(
        `SELECT id, region, label, start_hour, end_hour, multiplier, buffer_minutes, is_active
        FROM delivery_eta_adjustments
        ORDER BY region ASC, start_hour ASC, id ASC`
    );
    return rows;
};

exports.findAdjustmentById = async (id) => {
    const [rows] = await db.query("SELECT * FROM delivery_eta_adjustments WHERE id = ?", [id]);
    return rows[0] || null;
};

exports.insertAdjustment = async ({ region, label, startHour, endHour, multiplier, bufferMinutes, isActive }) => {
    const [result] = await db.query(
        `INSERT INTO delivery_eta_adjustments (region, label, start_hour, end_hour, multiplier, buffer_minutes, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [region, label, startHour, endHour, multiplier, bufferMinutes, isActive ? 1 : 0]
    );
    return result.insertId;
};

exports.updateAdjustment = async (id, { region, label, startHour, endHour, multiplier, bufferMinutes, isActive }) => {
    await db.query(
        `UPDATE delivery_eta_adjustments
        SET region = ?, label = ?, start_hour = ?, end_hour = ?, multiplier = ?, buffer_minutes = ?, is_active = ?
        WHERE id = ?`,
        [region, label, startHour, endHour, multiplier, bufferMinutes, isActive ? 1 : 0, id]
    );
};

exports.deleteAdjustment = async (id) => {
    await db.query("DELETE FROM delivery_eta_adjustments WHERE id = ?", [id]);
};

// The agent's registered vehicle (users.vehicle_type), so live pricing of an
// order without a checkout quote can use the matching rate card.
exports.findAgentVehicleType = async (agentId) => {
    const [rows] = await db.query("SELECT vehicle_type FROM users WHERE id = ?", [agentId]);
    return rows[0]?.vehicle_type || null;
};
