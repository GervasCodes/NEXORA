/**
 * Payment-provider registry — Phase 5 (Resilience & Growth).
 *
 * NEXORA has four payment rails, each with a genuinely different shape:
 *   - mobile_money: a router (mobileMoney.provider.js) over malipopay /
 *     selcom / azampay, USSD-push style (phone, amount, meta) -> pending.
 *   - snippe: hosted checkout session, redirect-based (createCheckoutSession).
 *   - malipopay_card: MalipoPay's separate card-checkout product (Visa /
 *     Mastercard / Amex / UnionPay) - also hosted checkout session,
 *     redirect-based (createCheckoutSession), same shape as snippe but a
 *     fully independent integration/credentials from the mobile_money
 *     rail's own MalipoPay adapter. See malipopayCard.provider.js's
 *     header comment for why these two never share config.
 *   - paypal: hosted order/capture flow, redirect-based (createOrder/captureOrder).
 *
 * `type: "card"` on an entry's metadata marks it as a redirect-based card
 * gateway - the frontend checkout page reads this to build its card
 * payment options dynamically instead of hardcoding provider keys (see
 * Checkout.jsx). Every rail below still keeps its capabilities object for
 * the order/booking/verificationFee/refund/disbursement/requiresRedirect
 * questions that predate this field.
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
const malipopayCardProvider = require("./malipopayCard.provider");
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
        // Delegates to mobileMoney.provider.js#isConfigured, which resolves
        // MOBILE_MONEY_PROVIDER to its real underlying rail (malipopay /
        // selcom / azampay) and checks THAT rail's actual isConfigured() -
        // i.e. whether its API credentials are genuinely present, not just
        // whether an env var names it. Outside production this always
        // reports true since resolveProvider() always has the simulate
        // provider to fall back to there.
        //
        // This used to only check that MOBILE_MONEY_PROVIDER was set to
        // something other than "simulate", without checking the named
        // provider's real credentials - so checkout could list Mobile
        // Money as available while the actual initiate() call then failed
        // with "Mobile money is not configured" (see docs/PAYMENT_PROVIDERS.md).
        isConfigured: () => {
            if (process.env.NODE_ENV !== "production") return true;
            return mobileMoneyProvider.isConfigured();
        }
    },
    {
        key: "snippe",
        label: "Snippe (cards)",
        type: "card",
        module: snippeProvider,
        capabilities: {
            order: true,
            booking: true,
            verificationFee: true,
            refund: true,
            disbursement: false,
            requiresRedirect: true
        },
        // Phase 3: MalipoPay Card is now the primary/default card gateway
        // (see the malipopay_card entry below) - Snippe carries a higher
        // per-transaction fee than MalipoPay's advertised 3.0% card rate,
        // so it's off by default rather than removed outright (an admin
        // who's already relying on it, or wants a second card rail as a
        // fallback, can still turn it back on). Requires both real
        // credentials AND this explicit opt-in - credentials alone are no
        // longer enough to surface it at checkout.
        isConfigured: () => process.env.PAYMENT_ENABLE_SNIPPE === "true" && snippeProvider.isConfigured()
    },
    {
        key: "malipopay_card",
        label: "MalipoPay (cards)",
        type: "card",
        // Phase 3: the primary/default card gateway - see checkout
        // ordering in Checkout.jsx, which now sorts a `primary` rail
        // first among same-`type` options instead of using whatever
        // order the API happened to return them in.
        primary: true,
        module: malipopayCardProvider,
        // Buyer-facing checkout can read this to render "Visa,
        // Mastercard, ..." next to the option - not used anywhere else in
        // this registry, purely descriptive metadata for this rail.
        brands: () => malipopayCardProvider.getEnabledBrands(),
        capabilities: {
            order: true,
            booking: true,
            verificationFee: true,
            refund: true,
            disbursement: false,
            requiresRedirect: true
        },
        isConfigured: () => malipopayCardProvider.isConfigured()
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
        // Phase 3: PayPal charges are meaningfully more expensive than
        // MalipoPay's local card rate and add a currency-conversion step
        // most TZS-based buyers don't need - kept available (it's the
        // only rail international/diaspora buyers without local mobile
        // money or a TZS-issued card can use) but off by default, same
        // opt-in pattern as Snippe above.
        isConfigured: () => process.env.PAYMENT_ENABLE_PAYPAL === "true" && paypalProvider.isConfigured()
    }
];

exports.getProvider = (key) => PROVIDERS.find((provider) => provider.key === key) || null;

exports.listProviders = () => PROVIDERS.map(({ key, label, type, primary, capabilities, isConfigured, brands }) => ({
    key,
    label,
    // Optional - only card-type rails set this today. Left undefined
    // (not defaulted to some generic value) for every other rail so
    // existing consumers of this list that don't know about `type` keep
    // seeing exactly the shape they always have.
    ...(type ? { type } : {}),
    ...(primary ? { primary: true } : {}),
    ...(brands ? { brands: brands() } : {}),
    capabilities,
    configured: Boolean(isConfigured())
}))
    // MalipoPay Card (primary: true) sorts first among configured rails -
    // Checkout.jsx renders in this order, so the primary gateway is
    // always the first/default option a buyer sees rather than whatever
    // order they happen to be declared in above.
    .sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));

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
