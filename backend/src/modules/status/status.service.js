const db = require("../../config/db");
const crypto = require("crypto");
const statusRepository = require("./status.repository");
const emailOutboxService = require("../emailOutbox/emailOutbox.service");
const logger = require("../../utils/logger").child({ module: "status" });
const Sentry = require("../../config/sentry");

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

// Emails every subscriber about an incident change through the retry
// outbox. Best effort: a failure here never blocks the admin's update.
const notifySubscribers = async (incident) => {
    try {
        const subscribers = await statusRepository.listSubscribers();
        if (subscribers.length === 0) return;
        const baseUrl = (process.env.FRONTEND_URL || "https://nexora.co.tz").replace(/\/$/, "");
        const subject = `[NEXORA status] ${incident.status === "resolved" ? "Resolved" : "Update"}: ${incident.title}`;
        for (const sub of subscribers) {
            const unsubscribeUrl = `${baseUrl}/status?unsubscribe=${sub.unsubscribe_token}`;
            const text = [
                incident.title,
                `Status: ${incident.status} (${incident.severity})`,
                "",
                incident.message,
                "",
                `Live status: ${baseUrl}/status`,
                `Unsubscribe: ${unsubscribeUrl}`
            ].join("\n");
            await emailOutboxService.enqueue({ to: sub.email, subject, text });
        }
    } catch (err) {
        logger.error({ err, incidentId: incident.id }, "status subscriber notification failed");
        Sentry.captureException(err, { tags: { area: "status", stage: "subscriber-notify" } });
    }
};

exports.createIncident = async (data, createdBy) => {
    const id = await statusRepository.create(data, createdBy);
    const incident = await statusRepository.findById(id);
    if (incident) await notifySubscribers(incident);
    return id;
};

exports.updateIncident = async (id, data) => {
    const incident = await statusRepository.findById(id);
    if (!incident) throw new Error("Incident not found");
    await statusRepository.update(id, data);
    const updated = await statusRepository.findById(id);
    if (updated) await notifySubscribers(updated);
};

exports.subscribe = async (email) => {
    const token = crypto.randomBytes(24).toString("hex");
    await statusRepository.addSubscriber(email.trim().toLowerCase(), token);
};

exports.unsubscribe = async (token) => statusRepository.removeSubscriberByToken(token);
