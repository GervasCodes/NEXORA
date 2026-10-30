/**
 * "Payments under maintenance" switch.
 *
 * While the gateways are still being tested in their sandboxes, real buyers
 * must not be able to start an online payment. Set in .env:
 *
 *   PAYMENTS_MAINTENANCE=true
 *   PAYMENTS_MAINTENANCE_MESSAGE=...        optional, shown to buyers
 *   PAYMENTS_MAINTENANCE_TESTER_IDS=12,15   optional, user ids who may still pay
 *
 * Admins always bypass it, so they (and the listed testers) can run sandbox
 * payments through the real checkout while everyone else sees the notice.
 * Only gateway payments are blocked (mobile money, card, PayPal, wallet
 * top-up, subscriptions). Cash on delivery and paying from the wallet balance
 * are not gateway calls and stay open. Webhooks are never blocked, so a
 * payment already in flight still completes.
 */

const DEFAULT_MESSAGE =
    "Online payments are under maintenance right now. Please try again later, or choose Cash on Delivery.";

const isActive = () => String(process.env.PAYMENTS_MAINTENANCE || "").trim().toLowerCase() === "true";

const message = () => (process.env.PAYMENTS_MAINTENANCE_MESSAGE || "").trim() || DEFAULT_MESSAGE;

const testerIds = () =>
    String(process.env.PAYMENTS_MAINTENANCE_TESTER_IDS || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

const isTester = (user) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    return testerIds().includes(String(user.id));
};

// True when this user is currently blocked from starting a gateway payment.
exports.blocksUser = (user) => isActive() && !isTester(user);

// What GET /payments/methods tells the frontend.
exports.statusFor = (user) => ({
    active: exports.blocksUser(user),
    message: message()
});

exports.blockWhenPaymentsInMaintenance = (req, res, next) => {
    if (!exports.blocksUser(req.user)) {
        return next();
    }

    return res.status(503).json({
        success: false,
        code: "PAYMENTS_MAINTENANCE",
        message: message()
    });
};
