/**
 * Mobile money provider ROUTER.
 *
 * This is the only file payment.service.js (and wallet.service.js, for
 * payouts) ever talks to. It doesn't know or care which real provider is
 * behind it — that's decided entirely by MOBILE_MONEY_PROVIDER in .env.
 *
 * To switch providers (e.g. MalipoPay -> Selcom later), you change env
 * vars only. No other file in the app needs to change.
 *
 *   MOBILE_MONEY_PROVIDER=malipopay   (or "selcom", or "azampay")
 *
 * Each provider file exports the same shape:
 *   isConfigured() -> boolean
 *   initiate(phone, amount, meta) -> { success, transactionReference }
 *   disburse(phone, amount, meta) -> { success, transactionReference }
 *
 * Phase 5 (Resilience & Growth) added the third rail this comment used
 * to invite as a future example: azampay.provider.js, following this
 * same shape. Adding a fourth later means exactly what adding azampay
 * did: drop in <name>.provider.js with that same shape, add one line to
 * `providers` below, and set MOBILE_MONEY_PROVIDER=<name>. Nothing else
 * changes — see docs/PAYMENT_PROVIDERS.md for the full walkthrough.
 */

const providers = {
    malipopay: require("./malipopay.provider"),
    selcom: require("./selcom.provider"),
    // Phase 5 (Resilience & Growth): third rail prepared per this file's
    // own doc comment above. Inert until MOBILE_MONEY_PROVIDER=azampay is
    // set AND azampay.provider.js#isConfigured() passes — adding this line
    // changes no behavior for anyone still on malipopay/selcom.
    azampay: require("./azampay.provider")
};

const simulateProvider = require("./simulate.provider");

const activeProvider = () => providers[(process.env.MOBILE_MONEY_PROVIDER || "").toLowerCase()];

const resolveProvider = () => {
    const provider = activeProvider();

    if (provider && provider.isConfigured()) {
        return provider;
    }

    if (process.env.NODE_ENV === "production") {
        throw new Error(
            "Mobile money is not configured for production. Set " +
            "MOBILE_MONEY_PROVIDER to 'malipopay' or 'selcom' and set that " +
            "provider's required credentials in .env - refusing to simulate " +
            "a payment in production."
        );
    }

    return simulateProvider;
};

exports.initiate = async (phone, amount, meta = {}) => {
    return resolveProvider().initiate(phone, amount, meta);
};

exports.disburse = async (phone, amount, meta = {}) => {
    return resolveProvider().disburse(phone, amount, meta);
};

// Refund leg (Phase 2 - Refund Automation). Same routing rules as
// initiate/disburse: whichever provider is active in .env, falling back
// to the simulate provider outside production.
exports.refund = async (phone, amount, meta = {}) => {
    return resolveProvider().refund(phone, amount, meta);
};
