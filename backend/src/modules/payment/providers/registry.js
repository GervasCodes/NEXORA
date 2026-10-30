/**
 * Payment-provider registry.
 *
 * NEXORA has three buyer-facing payment rails:
 *   - mobile_money: a router (mobileMoney.provider.js) over AzamPay / Selcom /
 *     PawaPay, USSD-push style (phone, amount, meta) -> pending. The gateway
 *     is chosen with MOBILE_MONEY_PROVIDER.
 *   - card: a router (card.provider.js) over Selcom / AzamPay hosted checkout,
 *     redirect-based (createCheckoutSession). The gateway is chosen with
 *     CARD_PROVIDER. (PawaPay is mobile-money only, so it is not a card option.)
 *   - paypal: hosted order/capture flow, redirect-based (createOrder/captureOrder).
 * Cash on delivery and the buyer wallet are not external gateways and are not
 * listed here.
 *
 * `type: "card"` on an entry's metadata marks it as a redirect-based card
 * gateway - the frontend checkout page reads this to build its card payment
 * options instead of hardcoding provider keys (see Checkout.jsx). Every rail
 * keeps its capabilities object for the order/booking/verificationFee/refund/
 * disbursement/requiresRedirect questions.
 *
 * `gateway` names the concrete provider currently behind a rail (e.g.
 * "azampay"), for admin screens and diagnostics - checkout itself only needs
 * the rail.
 *
 * payment.service.js drives each rail directly (initiate/refund/webhook code is
 * untouched by this file). This registry is a read-only capability layer used
 * for:
 *   - a fail-fast startup check (catch a malformed/renamed provider export
 *     before a buyer hits it mid-checkout),
 *   - GET /payment/methods (so checkout only shows rails whose credentials are
 *     actually configured), and
 *   - onboarding another rail: docs/PAYMENT_PROVIDERS.md uses this registry as
 *     the map of what a new entry needs to declare.
 */

const mobileMoneyProvider = require("./mobileMoney.provider");
const cardProvider = require("./card.provider");
const paypalProvider = require("./paypal.provider");

// One entry per rail. `key` matches the values orders.payment_method /
// payments.method use in the database - see docs/DATABASE.md.
const PROVIDERS = [
    {
        key: "mobile_money",
        label: "Mobile Money",
        module: mobileMoneyProvider,
        gateway: () => mobileMoneyProvider.activeProviderName(),
        capabilities: {
            order: true,
            booking: true,
            verificationFee: true,
            refund: true,
            disbursement: true,
            requiresRedirect: false
        },
        // Delegates to mobileMoney.provider.js#isConfigured, which resolves
        // MOBILE_MONEY_PROVIDER and checks THAT gateway's real credentials -
        // not just whether an env var names it. Outside production this always
        // reports true since the router falls back to the simulate provider.
        isConfigured: () => {
            if (process.env.NODE_ENV !== "production") return true;
            return mobileMoneyProvider.isConfigured();
        }
    },
    {
        key: "card",
        label: "Card",
        type: "card",
        primary: true,
        module: cardProvider,
        gateway: () => cardProvider.activeProviderName(),
        capabilities: {
            order: true,
            booking: true,
            verificationFee: true,
            refund: true,
            disbursement: false,
            requiresRedirect: true
        },
        isConfigured: () => cardProvider.isConfigured()
    },
    {
        key: "paypal",
        label: "PayPal",
        module: paypalProvider,
        gateway: () => "paypal",
        capabilities: {
            order: true,
            booking: true,
            verificationFee: true,
            refund: true,
            disbursement: false,
            requiresRedirect: true
        },
        // The rail international/diaspora buyers without local mobile money or
        // a TZS-issued card can use. PayPal has no TZS, so amounts are
        // converted to USD (see paypal.provider.js). Listed as soon as its
        // credentials are set.
        isConfigured: () => paypalProvider.isConfigured()
    }
];

exports.getProvider = (key) => PROVIDERS.find((provider) => provider.key === key) || null;

exports.listProviders = () => PROVIDERS.map(({ key, label, type, primary, capabilities, isConfigured, gateway }) => ({
    key,
    label,
    ...(type ? { type } : {}),
    ...(primary ? { primary: true } : {}),
    gateway: gateway() || null,
    capabilities,
    configured: Boolean(isConfigured())
}))
    // A `primary` rail sorts first - Checkout.jsx renders in this order.
    .sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));

// Buyer-facing: only rails an admin has actually set credentials for (or, for
// mobile_money, that will resolve in production) - a checkout screen listing an
// unconfigured rail is worse than not listing it.
// The concrete gateway name stays out of this list: buyers just see "Card",
// "Mobile Money" or "PayPal"; which gateway actually serves a rail is the
// server's choice (CARD_PROVIDER / MOBILE_MONEY_PROVIDER).
exports.listConfiguredProviders = () => exports.listProviders()
    .filter((provider) => provider.configured)
    .map(({ gateway, ...buyerFacing }) => buyerFacing);

// Fail fast at boot rather than mid-checkout: every registered provider must
// expose isConfigured as a callable and declare its capabilities - this catches
// a renamed export or a bad merge before any buyer does. Logs and returns
// problems instead of throwing, so a misconfigured third-party rail (missing
// credentials is normal in dev) never prevents the server from starting.
exports.validateRegistry = (logger = console) => {
    const problems = [];

    for (const provider of PROVIDERS) {
        if (typeof provider.isConfigured !== "function") {
            problems.push(`${provider.key}: isConfigured is not a function`);
            continue;
        }
        if (!provider.capabilities || typeof provider.capabilities !== "object") {
            problems.push(`${provider.key}: missing capabilities metadata`);
            continue;
        }
        try {
            provider.isConfigured();
        } catch (error) {
            problems.push(`${provider.key}: isConfigured() threw - ${error.message}`);
        }
    }

    // CARD_PROVIDER=pawapay (or any name card.provider.js doesn't know) would
    // silently leave card checkout off - say so at boot.
    const badCardGateway = cardProvider.misconfiguredName();
    if (badCardGateway) {
        problems.push(`CARD_PROVIDER="${badCardGateway}" cannot take cards - use one of: ${cardProvider.PROVIDER_NAMES.join(", ")} (PawaPay is mobile money only)`);
    }

    if (problems.length) {
        logger.warn?.(`Payment provider registry: ${problems.length} issue(s) found:`) ??
            logger.log?.(`Payment provider registry: ${problems.length} issue(s) found:`);
        problems.forEach((problem) => (logger.warn?.(`  - ${problem}`) ?? logger.log?.(`  - ${problem}`)));
    }

    return problems;
};
