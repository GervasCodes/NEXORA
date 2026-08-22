// Phase 1 (Launch Blockers): a real backend/.env in this project had
// AADMIN_EMAIL instead of ADMIN_EMAIL, and MOBILE_MONEY_PROVIDER unset -
// neither is a syntax error, so Node started up fine and each problem
// only surfaced as quiet downstream behavior (database/seed.js silently
// skipping admin creation; mobileMoney.provider.js silently falling back
// to the simulate provider outside production, or refusing to resolve a
// provider in production). This check exists so that class of typo gets
// a loud warning at boot instead of a confusing bug report weeks later.
//
// It does NOT validate that values are *correct* (a real but wrong
// JWT_SECRET looks identical to a right one from here) - only that the
// variable names present in process.env look like what the app expects,
// and that a short list of vars the app can't safely run without are
// actually set. Warn-only, never blocks startup - see server.js.

// Every var referenced anywhere in src/, database/seed.js, or
// server.js - kept in sync with .env.example (same source list).
const KNOWN_VARS = [
    "PORT", "NODE_ENV", "CORS_ORIGIN", "LOG_LEVEL",
    "DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME",
    "DB_SSL", "DB_SSL_REJECT_UNAUTHORIZED", "DB_SSL_CA", "DB_SSL_CA_PATH",
    "DB_READ_HOST", "DB_READ_PORT", "DB_READ_USER", "DB_READ_PASSWORD", "DB_READ_NAME",
    "DB_READ_SSL", "DB_READ_SSL_REJECT_UNAUTHORIZED", "DB_READ_SSL_CA", "DB_READ_SSL_CA_PATH",
    "DB_READ_CONNECTION_LIMIT", "RUN_JOBS_IN_PROCESS",
    "JWT_SECRET",
    "ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_PHONE",
    "MOBILE_MONEY_PROVIDER", "MOBILE_MONEY_API_BASE_URL", "MOBILE_MONEY_API_KEY",
    "MOBILE_MONEY_API_SECRET", "MOBILE_MONEY_VENDOR_ID", "SELCOM_WEBHOOK_SECRET",
    "AZAMPAY_API_BASE_URL", "AZAMPAY_APP_NAME", "AZAMPAY_CLIENT_ID", "AZAMPAY_CLIENT_SECRET",
    "SNIPPE_API_BASE_URL", "SNIPPE_SECRET_KEY", "SNIPPE_WEBHOOK_SECRET",
    "MALIPOPAY_CARD_API_BASE_URL", "MALIPOPAY_CARD_SECRET_KEY", "MALIPOPAY_CARD_WEBHOOK_SECRET",
    "MALIPOPAY_CARD_VISA_ENABLED", "MALIPOPAY_CARD_MASTERCARD_ENABLED",
    "MALIPOPAY_CARD_AMEX_ENABLED", "MALIPOPAY_CARD_UNIONPAY_ENABLED",
    "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_MODE",
    "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
    "BREVO_API_KEY", "BREVO_SENDER_EMAIL", "BREVO_SENDER_NAME",
    "EMAIL_HOST", "EMAIL_PORT", "EMAIL_USER", "EMAIL_PASSWORD", "EMAIL_FROM",
    "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT",
    "OSRM_BASE_URL", "OSRM_PROFILE", "OSRM_TIMEOUT_MS", "ROUTING_PROVIDER", "ROUTING_FALLBACK_ENABLED",
    "SENTRY_DSN", "SENTRY_ENVIRONMENT", "SENTRY_RELEASE", "SENTRY_TRACES_SAMPLE_RATE",
    // Phase RF5 (red-flag remediation): Redis caching layer. All optional -
    // omitting REDIS_URL just means the app runs uncached (see
    // config/redis.js), never a hard failure.
    "REDIS_URL", "REDIS_DISABLED", "REDIS_TLS_REJECT_UNAUTHORIZED", "CACHE_TTL_SECONDS",
    // Phase Q3 (Communication Channels): WhatsApp Cloud API. All optional -
    // omitting these just means whatsapp/providers/whatsapp.provider.js
    // falls back to its simulate provider outside production (same shape
    // as MOBILE_MONEY_PROVIDER above).
    "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET",
    "FRONTEND_URL",
    // Phase Q4 (Tax Compliance): TRA VFD e-invoicing. Optional - omitting
    // these falls back to efd/providers/simulate.provider.js outside
    // production, same shape as the payment providers above.
    "TRA_VFD_BASE_URL", "TRA_VFD_API_KEY"
];

// Vars whose complete absence should be called out explicitly, not just
// caught by the typo-detector below (a var that's simply never been set
// isn't a "near miss" of anything).
const REQUIRED_ALWAYS = ["JWT_SECRET", "DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const REQUIRED_FOR_ADMIN_SEED = ["ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_PHONE"];

// Cheap Levenshtein distance - env var names are short (<40 chars), so
// this is trivial cost at boot and only runs once.
const levenshtein = (a, b) => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[a.length][b.length];
};

// Returns an array of human-readable problem strings (never throws).
// Pass logger yourself so this stays testable without mocking a module.
exports.check = () => {
    const problems = [];
    const presentVars = Object.keys(process.env);
    const unknownVars = presentVars.filter((name) => !KNOWN_VARS.includes(name));

    // Near-miss detection: an unrecognized env var that's suspiciously
    // close (edit distance 1-2) to one the app actually reads is exactly
    // what AADMIN_EMAIL was relative to ADMIN_EMAIL (distance 1).
    for (const unknown of unknownVars) {
        for (const known of KNOWN_VARS) {
            const distance = levenshtein(unknown, known);
            if (distance > 0 && distance <= 2) {
                problems.push(`env var "${unknown}" is not recognized but is very close to "${known}" - check for a typo`);
                break;
            }
        }
    }

    for (const name of REQUIRED_ALWAYS) {
        if (!process.env[name]) {
            problems.push(`required env var "${name}" is not set`);
        }
    }

    // Admin-seed vars are only needed to run database/seed.js, not for
    // the server itself, so this is a heads-up, not a hard requirement -
    // still worth surfacing since a missing/typo'd one here is exactly
    // what silently skips admin account creation (see database/seed.js).
    const missingSeedVars = REQUIRED_FOR_ADMIN_SEED.filter((name) => !process.env[name]);
    if (missingSeedVars.length && missingSeedVars.length < REQUIRED_FOR_ADMIN_SEED.length) {
        // Partial is more suspicious than all-missing (all-missing just
        // means seeding hasn't been set up yet at all).
        problems.push(`admin seed vars partially set - missing: ${missingSeedVars.join(", ")} (database/seed.js will refuse to run until all three are set)`);
    }

    if (process.env.NODE_ENV === "production" && !process.env.MOBILE_MONEY_PROVIDER) {
        problems.push("MOBILE_MONEY_PROVIDER is not set in production - mobile money payments will fail to resolve a provider (see mobileMoney.provider.js)");
    }

    return problems;
};

// Warn-only, matches paymentProviderRegistry.validateRegistry's own
// logger-injection pattern in server.js so both can be called the same
// way and neither ever blocks startup.
exports.run = (logger = console) => {
    const problems = exports.check();
    if (problems.length) {
        logger.warn?.(`Env var check: ${problems.length} issue(s) found:`) ?? logger.log?.(`Env var check: ${problems.length} issue(s) found:`);
        problems.forEach((problem) => (logger.warn?.(`  - ${problem}`) ?? logger.log?.(`  - ${problem}`)));
    }
    return problems;
};
