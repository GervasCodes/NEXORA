const auditRepository = require("./audit.repository");

// Fire-and-forget by design, same pattern as fraudService.evaluateOrder()
// in order.service.js: audit logging must never delay or fail the
// action it's recording (a login, an order, a payment) - if the log
// insert itself fails, we report it to the console and move on rather
// than surface it to the user or roll back the real action.
exports.log = (event) => {
    auditRepository.insertLog(event).catch((err) => {
        console.error(`[audit] failed to record "${event.eventType}":`, err.message);
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
