const db = require("../../config/db");

// Delivery business-management (Round 4, Phase 9) - see migration 145.

exports.findByOwner = async (ownerUserId) => {
    const [rows] = await db.query("SELECT * FROM delivery_businesses WHERE owner_user_id = ?", [ownerUserId]);
    return rows[0];
};

exports.create = async (ownerUserId, name) => {
    const [result] = await db.query(
        "INSERT INTO delivery_businesses (owner_user_id, name) VALUES (?, ?)",
        [ownerUserId, name]
    );
    return result.insertId;
};

// ---- roster ----

exports.findUserByEmail = async (email) => {
    const [rows] = await db.query(
        "SELECT id, first_name, last_name, email, role, account_verification_status FROM users WHERE email = ?",
        [email]
    );
    return rows[0];
};

exports.findMembershipByAgent = async (agentId) => {
    const [rows] = await db.query("SELECT * FROM delivery_business_agents WHERE agent_id = ?", [agentId]);
    return rows[0];
};

exports.countRoster = async (businessId) => {
    const [[row]] = await db.query(
        "SELECT COUNT(*) AS total FROM delivery_business_agents WHERE business_id = ?",
        [businessId]
    );
    return Number(row.total);
};

exports.addAgent = async (businessId, agentId) => {
    const [result] = await db.query(
        "INSERT INTO delivery_business_agents (business_id, agent_id) VALUES (?, ?)",
        [businessId, agentId]
    );
    return result.insertId;
};

exports.removeAgent = async (businessId, agentId) => {
    const [result] = await db.query(
        "DELETE FROM delivery_business_agents WHERE business_id = ? AND agent_id = ?",
        [businessId, agentId]
    );
    return result.affectedRows;
};

exports.findRoster = async (businessId) => {
    const [rows] = await db.query(
        `SELECT dba.agent_id, dba.created_at AS joined_at,
                u.first_name, u.last_name, u.email, u.phone, u.photo_url, u.vehicle_type
         FROM delivery_business_agents dba
         JOIN users u ON u.id = dba.agent_id
         WHERE dba.business_id = ?
         ORDER BY dba.created_at DESC`,
        [businessId]
    );
    return rows;
};

exports.countOpenJobsForAgent = async (businessId, agentId) => {
    const [[row]] = await db.query(
        `SELECT COUNT(*) AS total FROM delivery_business_jobs
         WHERE business_id = ? AND assigned_agent_id = ? AND status IN ('assigned', 'picked_up')`,
        [businessId, agentId]
    );
    return Number(row.total);
};

// ---- independent jobs ----

exports.insertJob = async (job) => {
    const [result] = await db.query(
        `INSERT INTO delivery_business_jobs
            (business_id, reference, pickup_address, dropoff_address, customer_name,
             customer_phone, description, fee_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            job.businessId, job.reference || null, job.pickupAddress, job.dropoffAddress,
            job.customerName, job.customerPhone || null, job.description || null, job.feeAmount
        ]
    );
    return result.insertId;
};

// Locks the job row; scoped by business so an owner can never lock or
// change another business's job.
exports.lockJob = async (connection, businessId, jobId) => {
    const [rows] = await connection.query(
        "SELECT * FROM delivery_business_jobs WHERE id = ? AND business_id = ? FOR UPDATE",
        [jobId, businessId]
    );
    return rows[0];
};

exports.findJob = async (businessId, jobId, connection = db) => {
    const [rows] = await connection.query(
        `SELECT j.*, u.first_name AS agent_first_name, u.last_name AS agent_last_name
         FROM delivery_business_jobs j
         LEFT JOIN users u ON u.id = j.assigned_agent_id
         WHERE j.id = ? AND j.business_id = ?`,
        [jobId, businessId]
    );
    return rows[0];
};

exports.isRosterMember = async (connection, businessId, agentId) => {
    const [rows] = await connection.query(
        "SELECT id FROM delivery_business_agents WHERE business_id = ? AND agent_id = ?",
        [businessId, agentId]
    );
    return rows.length > 0;
};

exports.updateJob = async (connection, jobId, fields) => {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    const sets = keys.map((k) => `${k} = ?`).join(", ");
    await connection.query(`UPDATE delivery_business_jobs SET ${sets} WHERE id = ?`, [...keys.map((k) => fields[k]), jobId]);
};

exports.listJobs = async (businessId, { status, agentId, limit, offset }) => {
    const conditions = ["j.business_id = ?"];
    const params = [businessId];
    if (status) { conditions.push("j.status = ?"); params.push(status); }
    if (agentId) { conditions.push("j.assigned_agent_id = ?"); params.push(agentId); }
    const where = conditions.join(" AND ");

    const [rows] = await db.query(
        `SELECT j.*, u.first_name AS agent_first_name, u.last_name AS agent_last_name
         FROM delivery_business_jobs j
         LEFT JOIN users u ON u.id = j.assigned_agent_id
         WHERE ${where}
         ORDER BY j.created_at DESC, j.id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total FROM delivery_business_jobs j WHERE ${where}`,
        params
    );
    return { rows, total };
};

exports.jobStatusCounts = async (businessId) => {
    const [rows] = await db.query(
        "SELECT status, COUNT(*) AS count FROM delivery_business_jobs WHERE business_id = ? GROUP BY status",
        [businessId]
    );
    return rows;
};

// ---- fleet reporting ----
// All three take the roster's agent ids; windows are [from, to + 1 day).

exports.nexoraDeliveriesByAgent = async (agentIds, from, to) => {
    if (!agentIds.length) return [];
    const [rows] = await db.query(
        `SELECT agent_id,
                SUM(status = 'delivered' AND delivered_at >= ? AND delivered_at < DATE_ADD(?, INTERVAL 1 DAY)) AS delivered,
                SUM(status = 'failed' AND updated_at >= ? AND updated_at < DATE_ADD(?, INTERVAL 1 DAY)) AS failed,
                SUM(status IN ('assigned', 'picked_up', 'in_transit')) AS active
         FROM deliveries
         WHERE agent_id IN (?)
         GROUP BY agent_id`,
        [from, to, from, to, agentIds]
    );
    return rows;
};

exports.nexoraEarningsByAgent = async (agentIds, from, to) => {
    if (!agentIds.length) return [];
    const [rows] = await db.query(
        `SELECT agent_id, COALESCE(SUM(amount), 0) AS earnings
         FROM agent_earnings
         WHERE agent_id IN (?) AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY agent_id`,
        [agentIds, from, to]
    );
    return rows;
};

exports.independentByAgent = async (businessId, from, to) => {
    const [rows] = await db.query(
        `SELECT assigned_agent_id AS agent_id,
                SUM(status = 'delivered' AND delivered_at >= ? AND delivered_at < DATE_ADD(?, INTERVAL 1 DAY)) AS delivered,
                COALESCE(SUM(CASE WHEN fee_collected = 1
                    AND fee_collected_at >= ? AND fee_collected_at < DATE_ADD(?, INTERVAL 1 DAY)
                    THEN fee_amount ELSE 0 END), 0) AS fees_collected
         FROM delivery_business_jobs
         WHERE business_id = ? AND assigned_agent_id IS NOT NULL
         GROUP BY assigned_agent_id`,
        [from, to, from, to, businessId]
    );
    return rows;
};

// Business-wide independent-job totals (every job, whoever it was or is
// assigned to), so history survives roster changes and account deletion.
exports.independentTotals = async (businessId, from, to) => {
    const [[row]] = await db.query(
        `SELECT COALESCE(SUM(status = 'delivered' AND delivered_at >= ? AND delivered_at < DATE_ADD(?, INTERVAL 1 DAY)), 0) AS delivered,
                COALESCE(SUM(CASE WHEN fee_collected = 1
                    AND fee_collected_at >= ? AND fee_collected_at < DATE_ADD(?, INTERVAL 1 DAY)
                    THEN fee_amount ELSE 0 END), 0) AS fees_collected
         FROM delivery_business_jobs
         WHERE business_id = ?`,
        [from, to, from, to, businessId]
    );
    return row;
};
