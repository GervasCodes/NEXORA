const db = require("../../config/db");

exports.listRecent = async (limit = 50) => {
    const [rows] = await db.query(
        `SELECT si.*, u.first_name, u.last_name
        FROM status_incidents si
        LEFT JOIN users u ON u.id = si.created_by
        ORDER BY si.started_at DESC
        LIMIT ?`,
        [limit]
    );
    return rows;
};

// "Ongoing" = anything not yet resolved - what the status page's banner
// is built from; a resolved incident only shows up in the history list.
exports.listOngoing = async () => {
    const [rows] = await db.query(
        `SELECT * FROM status_incidents WHERE status != 'resolved' ORDER BY started_at DESC`
    );
    return rows;
};

exports.create = async (data, createdBy) => {
    const [result] = await db.query(
        `INSERT INTO status_incidents (title, component, severity, status, message, created_by)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [data.title, data.component || "platform", data.severity || "minor", data.status || "investigating", data.message, createdBy]
    );
    return result.insertId;
};

exports.findById = async (id) => {
    const [rows] = await db.query("SELECT * FROM status_incidents WHERE id = ?", [id]);
    return rows[0];
};

exports.update = async (id, data) => {
    const fields = [];
    const values = [];

    const setIfPresent = (column, value) => {
        if (value !== undefined) {
            fields.push(`${column} = ?`);
            values.push(value);
        }
    };

    setIfPresent("title", data.title);
    setIfPresent("component", data.component);
    setIfPresent("severity", data.severity);
    setIfPresent("message", data.message);

    if (data.status !== undefined) {
        fields.push("status = ?");
        values.push(data.status);
        if (data.status === "resolved") {
            fields.push("resolved_at = NOW()");
        }
    }

    if (fields.length === 0) return;

    values.push(id);
    await db.query(`UPDATE status_incidents SET ${fields.join(", ")} WHERE id = ?`, values);
};
