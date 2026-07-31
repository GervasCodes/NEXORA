/**
 * Payment-provider registry — Phase 5 (Resilience & Growth).
 *
 * NEXORA has three payment rails, each with a genuinely different shape:
 *   - mobile_money: a router (mobileMoney.provider.js) over malipopay /
 *     selcom / azampay, USSD-push style (phone, amount, meta) -> pending.
 *   - snippe: hosted checkout session, redirect-based (createCheckoutSession).
 *   - paypal: hosted order/capture flow, redirect-based (createOrder/captureOrder).
 *
 * payment.service.js already knows how to drive each of these directly
 * (that code is untouched by this file — see "what this file is NOT"
 * below). What was missing was a single place to answer, generically,
 * "what rails exist, which of them are actually configured right now,
 * and what can each one do" — needed for:
 *   - a fail-fast startup check (catch a malformed/renamed provider
 *     export before a buyer hits it mid-checkout, not after),
 *   - the new GET /payment/methods endpoint (so checkout can show only
 *     rails an admin has actually configured credentials for), and
 *   - onboarding a future rail: the walkthrough in
 *     docs/PAYMENT_PROVIDERS.md uses this registry as the map of what a
 *     new entry needs to declare.
 *
 * What this file is NOT: it does not replace or wrap the provider calls
 * inside payment.service.js's initiate/refund/webhook functions. Those
 * three rails have different enough parameter shapes (phone+amount+meta
 * vs. a checkout-session options object vs. an order/capture pair) that
 * forcing them through one generic `initiate(context)` signature would
 * mean rewriting every existing payment flow with no test suite run
 * against it in this phase — not a trade worth making. This registry is
 * an additive, read-only capability layer; every existing payment
 * function keeps calling its own provider module exactly as before.
 */

const mobileMoneyProvider = require("./mobileMoney.provider");
const snippeProvider = require("./snippe.provider");
const paypalProvider = require("./paypal.provider");

// One entry per rail. `key` matches (or, for mobile_money, subsumes) the
// values orders.payment_method / bookings.payment_method already use in
// the database — see docs/DATABASE.md.
const PROVIDERS = [
    {
        key: "mobile_money",
        label: "Mobile Money",
        module: mobileMoneyProvider,
        capabilities: {
            order: true,
            booking: true,
            verificationFee: true,
            refund: true,
            disbursement: true,
            requiresRedirect: false
        },
        // The router itself has no isConfigured() (it defers to whichever
        // underlying rail MOBILE_MONEY_PROVIDER selects, falling back to
        // the simulate provider outside production) — so "configured"
        // here means "resolvable in production without throwing", which
        // is exactly what NODE_ENV=production + a working underlying
        // rail guarantees. Outside production this always reports true
        // since the simulate provider is always available as a fallback.
        isConfigured: () => {
            if (process.env.NODE_ENV !== "production") return true;
            const active = (process.env.MOBILE_MONEY_PROVIDER || "").toLowerCase();
            return Boolean(active) && active !== "simulate";
        }
    },
    {
        key: "snippe",
        label: "Snippe (cards)",
        module: snippeProvider,
        capabilities: {
            order: true,
            booking: true,
            verificationFee: true,
            refund: true,
            disbursement: false,
            requiresRedirect: true
        },
        isConfigured: () => snippeProvider.isConfigured()
    },
    {
        key: "paypal",
        label: "PayPal",
        module: paypalProvider,
        capabilities: {
            order: true,
            booking: true,
            verificationFee: true,
            refund: true,
            disbursement: false,
            requiresRedirect: true
        },
        isConfigured: () => paypalProvider.isConfigured()
    }
];

exports.getProvider = (key) => PROVIDERS.find((provider) => provider.key === key) || null;

exports.listProviders = () => PROVIDERS.map(({ key, label, capabilities, isConfigured }) => ({
    key,
    label,
    capabilities,
    configured: Boolean(isConfigured())
}));

// Buyer-facing: only rails an admin has actually set credentials for
// (or, for mobile_money, that will resolve in production) - a checkout
// screen listing an unconfigured rail is worse than not listing it.
exports.listConfiguredProviders = () => exports.listProviders().filter((provider) => provider.configured);

// Fail fast at boot rather than mid-checkout: every registered provider
// must expose isConfigured as a callable and declare its capabilities -
// this catches a renamed export or a bad merge before any buyer does.
// Logs and returns problems instead of throwing, so a misconfigured
// third-party rail (e.g. missing credentials, which is normal in dev)
// never prevents the server from starting - only a genuinely broken
// module shape is worth surfacing loudly.
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

    if (problems.length) {
        logger.warn?.(`Payment provider registry: ${problems.length} issue(s) found:`) ??
            logger.log?.(`Payment provider registry: ${problems.length} issue(s) found:`);
        problems.forEach((problem) => (logger.warn?.(`  - ${problem}`) ?? logger.log?.(`  - ${problem}`)));
    }

    return problems;
};
