/**
 * Card provider ROUTER - hosted card checkout (redirect-based).
 *
 * Same idea as mobileMoney.provider.js: payment.service.js only talks to this
 * file, and CARD_PROVIDER in .env decides which gateway takes the card:
 *
 *   CARD_PROVIDER=selcom   (or "azampay")
 *
 * Each adapter listed below exports
 *   isConfigured() -> boolean
 *   createCheckoutSession({ amountTzs, reference, description, successUrl, cancelUrl, buyer })
 *       -> { success, sessionId, url }      (redirect the buyer to `url`)
 *   checkStatus(reference)                  (optional)
 *
 * PawaPay is intentionally not here: it only collects from mobile-money
 * wallets (see pawapay.provider.js). Setting CARD_PROVIDER=pawapay is reported
 * as "card not configured" instead of silently taking cards nowhere.
 */

const azampay = require("./azampay.provider");
const selcom = require("./selcom.provider");

const providers = {
    selcom,
    // AzamPay's hosted page additionally needs AZAMPAY_VENDOR_ID, which
    // isConfigured() alone does not check - wrap it so the card rail only
    // lights up when checkout would actually work.
    azampay: {
        isConfigured: () => azampay.supportsCheckout(),
        createCheckoutSession: azampay.createCheckoutSession
    }
};

exports.PROVIDER_NAMES = Object.keys(providers);

const activeName = () => (process.env.CARD_PROVIDER || "").toLowerCase();

const activeProvider = () => providers[activeName()];

exports.activeProviderName = () => (activeProvider() ? activeName() : null);

exports.isConfigured = () => {
    const provider = activeProvider();
    return Boolean(provider) && provider.isConfigured();
};

// Which card gateway is selected but cannot take cards (e.g. CARD_PROVIDER=pawapay).
exports.misconfiguredName = () => (activeName() && !activeProvider() ? activeName() : null);

exports.createCheckoutSession = async (options) => {
    const provider = activeProvider();

    if (!provider || !provider.isConfigured()) {
        throw new Error("Card payments are not configured");
    }

    const session = await provider.createCheckoutSession(options);
    return { ...session, provider: activeName() };
};

// Status lookup through the gateway that took the payment (payments.provider).
// Gateways without a lookup (AzamPay) report "unknown" - the sweep then uses
// its age cutoff, and a late success still arrives through the webhook.
exports.checkStatus = async (reference, providerName) => {
    const name = String(providerName || activeName()).toLowerCase();

    if (name !== "selcom" || !selcom.isConfigured()) {
        return { state: "unknown" };
    }

    return selcom.checkStatus(reference);
};
