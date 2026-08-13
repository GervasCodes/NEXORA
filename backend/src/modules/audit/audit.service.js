const auditRepository = require("./audit.repository");
const logger = require("../../utils/logger").child({ module: "audit" });
const Sentry = require("../../config/sentry");

// Fire-and-forget by design, same pattern as fraudService.evaluateOrder()
// in order.service.js: audit logging must never delay or fail the
// action it's recording (a login, an order, a payment) - if the log
// insert itself fails, we report it to the console and move on rather
// than surface it to the user or roll back the real action.
exports.log = (event) => {
    auditRepository.insertLog(event).catch((err) => {
        logger.error({ err, eventType: event.eventType }, "failed to record audit log");
        Sentry.captureException(err, { tags: { area: "audit" }, extra: { eventType: event.eventType } });
    });
};

// Convenience wrapper for the very common case of logging off an Express
// req object - pulls user id and IP consistently so call sites don't each
// re-derive them.
exports.logFromRequest = (req, { userId, eventType, description, metadata }) => {
    exports.log({
        userId: userId ?? req.user?.id,
        eventType,
        description,
        ipAddress: req.ip,
        metadata
    });
};
