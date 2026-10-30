/**
 * Mobile money provider ROUTER.
 *
 * This is the only file payment.service.js, refund.service.js and
 * wallet.service.js (payouts) talk to for mobile money. It does not know or
 * care which real gateway sits behind it - that is decided by
 * MOBILE_MONEY_PROVIDER in .env:
 *
 *   MOBILE_MONEY_PROVIDER=azampay   (or "selcom", or "pawapay")
 *
 * Switching gateway is an env change only. Every adapter exports the same
 * shape:
 *   isConfigured() -> boolean
 *   initiate(phone, amount, meta)  -> { success, transactionReference }
 *   refund(phone, amount, meta)    -> { success, transactionReference }
 *   disburse(phone, amount, meta)  -> { success, transactionReference }
 *   checkStatus(reference)         -> { state, ... }   (optional)
 *
 * Every successful initiate() result also carries `provider` - the adapter
 * that handled it - so the payment row can remember which gateway to ask about
 * it later (status checks, refunds), even if MOBILE_MONEY_PROVIDER is changed
 * afterwards.
 *
 * Adding another gateway: drop in <name>.provider.js with that shape and add
 * one line to `providers` below. See docs/PAYMENT_PROVIDERS.md.
 */

const providers = {
    azampay: require("./azampay.provider"),
    selcom: require("./selcom.provider"),
    pawapay: require("./pawapay.provider")
};

const simulateProvider = require("./simulate.provider");

exports.PROVIDER_NAMES = Object.keys(providers);

const activeName = () => (process.env.MOBILE_MONEY_PROVIDER || "").toLowerCase();

const activeProvider = () => providers[activeName()];

// A stored gateway name (payments.provider) wins over the currently active
// one: a payment must be followed up with the gateway that took it.
const providerFor = (name) => (name && providers[String(name).toLowerCase()]) || activeProvider();

const resolveProvider = (name) => {
    const provider = providerFor(name);

    if (provider && provider.isConfigured()) {
        return provider;
    }

    if (process.env.NODE_ENV === "production") {
        throw new Error("Mobile money is not configured");
    }

    return simulateProvider;
};

const nameOf = (provider) => Object.keys(providers).find((key) => providers[key] === provider) || null;

// Name of the gateway MOBILE_MONEY_PROVIDER currently points at, or null.
exports.activeProviderName = () => (activeProvider() ? activeName() : null);

// Used by providers/registry.js so checkout only lists Mobile Money when the
// selected gateway genuinely has working credentials right now. Mirrors
// resolveProvider() without throwing or falling back to the simulator.
exports.isConfigured = () => {
    const provider = activeProvider();
    return Boolean(provider) && provider.isConfigured();
};

exports.initiate = async (phone, amount, meta = {}) => {
    const provider = resolveProvider();
    const result = await provider.initiate(phone, amount, meta);
    return { ...result, provider: nameOf(provider) };
};

exports.disburse = async (phone, amount, meta = {}) => {
    return resolveProvider().disburse(phone, amount, meta);
};

// Refund leg. `meta.provider` / `meta.depositId` come from the stored payment
// row (see refund.service.js) so the refund goes back through the same gateway.
exports.refund = async (phone, amount, meta = {}) => {
    return resolveProvider(meta.provider).refund(phone, amount, meta);
};

// Asks a gateway for the status of one payment attempt.
// Returns { state: "success" | "failed" | "pending" | "unknown", ... }.
// Gateways with no status lookup (AzamPay and the dev simulator) report
// "unknown" - the stale sweep then falls back to its age cutoff, which is safe
// because a late success is still applied (or flagged for refund) by the
// webhook handlers.
exports.checkStatus = async (reference, providerName) => {
    const provider = providerFor(providerName);

    if (!provider || !provider.isConfigured() || typeof provider.checkStatus !== "function") {
        return { state: "unknown" };
    }

    return provider.checkStatus(reference);
};
