const db = require("../../config/db");

// See migration 160 for table shape/reasoning.

exports.logQuery = async (term, normalizedTerm) => {
    await db.query(
        "INSERT INTO search_queries (term, normalized_term) VALUES (?, ?)",
        [term, normalizedTerm]
    );
};

// Top N normalized terms searched within the trailing window, most-searched
// first. normalized_term (lowercase/trimmed) doubles as the display value -
// simpler and avoids GROUP_CONCAT/SUBSTRING_INDEX breaking on a raw term
// that happens to contain a comma. HAVING >= 2 keeps a single shopper's
// one-off typo from ever showing up as "trending".
exports.findTrending = async (sinceDate, limit) => {
    const [rows] = await db.query(
        `SELECT normalized_term, COUNT(*) AS search_count
         FROM search_queries
         WHERE created_at >= ?
         GROUP BY normalized_term
         HAVING COUNT(*) >= 2
         ORDER BY search_count DESC
         LIMIT ?`,
        [sinceDate, limit]
    );
    return rows;
};
