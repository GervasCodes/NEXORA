const db = require("../../config/db");
const statusRepository = require("./status.repository");

// Same live DB check /health (app.js) already does - duplicated here
// (rather than imported) because app.js's /health is deliberately a
// dependency-free top-level route that runs before any module routing,
// for uptime tools hitting it directly outside the normal API. This
// version feeds into getPublicStatus below, which the frontend status
// page calls through the normal /api/v1 client (api/client.js's
// baseURL already includes /api/v1, so a plain "/health" request from
// the frontend wouldn't reach app.js's route without reconfiguring the
// client just for this) - see docs/SLA.md.
exports.getLiveHealth = async () => {
    let dbConnected = false;
    try {
        await db.query("SELECT 1");
        dbConnected = true;
    } catch {
        dbConnected = false;
    }
    return {
        status: dbConnected ? "ok" : "degraded",
        database: dbConnected ? "connected" : "disconnected",
        timestamp: new Date().toISOString()
    };
};

exports.getPublicStatus = async () => {
    const [health, ongoing, recentIncidents] = await Promise.all([
        exports.getLiveHealth(),
        statusRepository.listOngoing(),
        statusRepository.listRecent(20)
    ]);

    return { health, ongoing, recentIncidents };
};

exports.listRecent = async () => statusRepository.listRecent();

exports.createIncident = async (data, createdBy) => statusRepository.create(data, createdBy);

exports.updateIncident = async (id, data) => {
    const incident = await statusRepository.findById(id);
    if (!incident) throw new Error("Incident not found");
    await statusRepository.update(id, data);
};
