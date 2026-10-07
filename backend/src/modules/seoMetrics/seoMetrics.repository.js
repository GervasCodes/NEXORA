const db = require("../../config/db");

exports.insertVital = async ({ metric, value, rating, route, device }) => {
    await db.query(
        "INSERT INTO web_vitals_samples (metric, value, rating, route, device) VALUES (?, ?, ?, ?, ?)",
        [metric, value, rating, route, device]
    );
};

// One row per (scope, term); repeat misses just count up.
exports.bumpSearchMiss = async ({ scope, term }) => {
    await db.query(
        `INSERT INTO search_zero_results (scope, term) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE hits = hits + 1, last_seen_at = CURRENT_TIMESTAMP`,
        [scope, term]
    );
};

exports.listSearchMisses = async (limit) => {
    const [rows] = await db.query(
        `SELECT scope, term, hits, first_seen_at, last_seen_at
         FROM search_zero_results
         ORDER BY hits DESC, last_seen_at DESC
         LIMIT ?`,
        [limit]
    );
    return rows;
};

// p75 is what Google's Core Web Vitals thresholds are judged on.
exports.summarizeVitals = async (days) => {
    const [rows] = await db.query(
        `SELECT metric, route, device, COUNT(*) AS samples, AVG(value) AS average,
                SUM(rating = 'good') AS good, SUM(rating = 'poor') AS poor
         FROM web_vitals_samples
         WHERE created_at >= (NOW() - INTERVAL ? DAY)
         GROUP BY metric, route, device
         ORDER BY samples DESC
         LIMIT 500`,
        [days]
    );
    return rows;
};

exports.deleteOldVitals = async (days) => {
    const [result] = await db.query(
        "DELETE FROM web_vitals_samples WHERE created_at < (NOW() - INTERVAL ? DAY)",
        [days]
    );
    return result.affectedRows;
};
