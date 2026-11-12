// (Launch Blockers): a real backend/.env in this project had
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
// actually set. By default it only warns. Two exceptions, see fatal() and
// strictProblems() below: a small set of clearly dangerous configurations
// stops startup, and STRICT_SECURITY_CHECKS=true turns the production
// security warnings into startup failures as well.

// Every var referenced anywhere in src/, database/seed.js, or
// server.js - kept in sync with .env.example (same source list).
const KNOWN_VARS = [
    "PORT", "NODE_ENV", "CORS_ORIGIN", "LOG_LEVEL",
    // Count of reverse-proxy hops in front of the app, for Express's
    // "trust proxy" (app.js) - see the comment there. Optional, defaults
    // to 1 (Render's own proxy only).
    "TRUST_PROXY_HOPS",
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
    "AZAMPAY_AUTH_BASE_URL", "AZAMPAY_API_KEY", "AZAMPAY_VENDOR_ID", "AZAMPAY_VENDOR_NAME", "AZAMPAY_WEBHOOK_SECRET",
    "SELCOM_API_BASE_URL", "SELCOM_API_KEY", "SELCOM_API_SECRET", "SELCOM_VENDOR_ID",
    "SELCOM_PUBLIC_API_URL", "SELCOM_CARD_PAYMENT_METHODS",
    "DB_CONNECT_TIMEOUT_MS", "DB_LOCK_POOL_LIMIT", "DB_LOCK_WAIT_TIMEOUT_S", "DB_MAX_EXECUTION_MS", "DB_POOL_QUEUE_LIMIT",
    "PAYMENTS_MAINTENANCE", "PAYMENTS_MAINTENANCE_MESSAGE", "PAYMENTS_MAINTENANCE_TESTER_IDS",
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
    // Roadmap Phase 1 (WhatsApp/SMS as an Offer-Accept Channel): SMS
    // gateway fallback for delivery agents without WhatsApp. All
    // optional - omitting SMS_GATEWAY_API_KEY/SECRET_KEY just means
    // sms/providers/sms.provider.js falls back to its simulate provider
    // outside production, same shape as WHATSAPP_PHONE_NUMBER_ID above.
    "SMS_GATEWAY_BASE_URL", "SMS_GATEWAY_API_KEY", "SMS_GATEWAY_SECRET_KEY",
    "SMS_GATEWAY_SENDER_ID", "SMS_GATEWAY_WEBHOOK_SECRET",
    // Phase Q4 (Tax Compliance): TRA VFD e-invoicing. Optional - omitting
    // these falls back to efd/providers/simulate.provider.js outside
    // production, same shape as the payment providers above.
    "TRA_VFD_BASE_URL", "TRA_VFD_API_KEY",
    // Upload malware scanning (ClamAV via clamd). Optional in every
    // environment, production included (Roadmap Phase 1 global rule 5's
    // fail-open posture) - omitting CLAMAV_HOST just skips scanning
    // with a warning (see utils/malwareScan.js), same shape as
    // BREVO_API_KEY above.
    "CLAMAV_HOST", "CLAMAV_PORT",
    // Phase RF4 (red-flag remediation): mysql2 pool size, read by
    // config/db.js. Optional - falls back to 10 if unset. Was missing
    // from this list since RF4 added it (found during Phase 2 of the
    // NEXORA Fix Plan while cross-checking against .env.example).
    "DB_POOL_CONNECTION_LIMIT",
    // Variables read by the code but previously missing from this list (found
    // by comparing every process.env.* reference in src/ with this array).
    "AI_PROVIDER", "AI_MODEL", "AI_PROVIDER_BASE_URL", "AI_OPENROUTER_SITE_NAME", "AI_OPENROUTER_SITE_URL",
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY",
    "BREVO_WEBHOOK_SECRET", "SELCOM_WEBHOOK_ALLOWED_IPS", "GOOGLE_CLIENT_ID",
    "CARD_PROVIDER",
    "PAWAPAY_API_TOKEN", "PAWAPAY_MODE", "PAWAPAY_API_BASE_URL",
    "PAWAPAY_ALLOW_UNSIGNED_CALLBACKS", "PAWAPAY_CALLBACK_AUTHORITY",
    "PAYMENT_ENABLE_PAYPAL", "PAYPAL_WEBHOOK_ID",
    "PAYMENT_AMOUNT_TOLERANCE_PERCENT", "PAYMENT_RECONCILIATION_DAYS",
    "STALE_BOOKING_MINUTES", "STALE_HOSTED_PAYMENT_HARD_MINUTES", "STALE_HOSTED_PAYMENT_MINUTES",
    "STALE_PAYMENT_HARD_MINUTES", "STALE_PAYMENT_MINUTES",
    "WHATSAPP_ORDER_TEMPLATE_LANG", "WHATSAPP_ORDER_TEMPLATE_NAME",
    "WHATSAPP_OTP_TEMPLATE_LANG", "WHATSAPP_OTP_TEMPLATE_NAME",
    "DOCUMENT_URL_TTL_SECONDS", "EMAIL_LOGO_URL", "SUPPORT_EMAIL", "RENDER_DEPLOY_HOOK_URL",
    // Dangerous switches: never valid in production (see strictProblems()).
    "ALLOW_UNSIGNED_WEBHOOKS", "ALLOW_PLATFORM_DATA_RESET", "ALLOW_PLATFORM_DATA_RESET_REAL", "LOADTEST_BYPASS_TOKEN",
    // Startup-check controls (this file).
    "ALLOW_NON_LOCAL_DEV_DB", "STRICT_SECURITY_CHECKS", "ADMIN_SESSION_TTL", "PAYOUT_DUAL_APPROVAL_THRESHOLD",
    // Dedicated key for encrypting stored payer phone numbers (utils/phoneEncryption.js).
    "PHONE_ENCRYPTION_KEY", "PHONE_ENCRYPTION_KEY_ID", "PHONE_ENCRYPTION_KEY_PREVIOUS"
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

    // Uploads fail OPEN without CLAMAV_HOST (see utils/malwareScan.js), so in
    // production that is a real security gap worth being loud about - it
    // does not block startup, but it shows in the boot log on every deploy.
    if (process.env.NODE_ENV === "production" && !process.env.CLAMAV_HOST) {
        problems.push("CLAMAV_HOST is not set in production - uploaded files are NOT being virus-scanned (see utils/malwareScan.js)");
    }

    problems.push(...exports.fatal());
    problems.push(...exports.strictProblems());

    return problems;
};


const ALLOWED_NODE_ENVS = ["production", "development", "test"];
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

// Conditions that stop startup in every environment (see enforce()). They are
// limited to configurations where continuing is clearly dangerous:
//  - Payment, SMS, WhatsApp and TRA integrations use a *simulate* provider
//    whenever NODE_ENV is not "production". A mistyped NODE_ENV ("prod",
//    "Production", ...) in a real deployment would therefore silently
//    simulate payments.
//  - A non-production process pointed at a non-local database is the other way
//    the same mistake shows up (real data, simulated providers).
// Set ALLOW_NON_LOCAL_DEV_DB=true for a deliberate shared staging database.
exports.fatal = () => {
    const problems = [];
    const nodeEnv = process.env.NODE_ENV;
    const dbHost = (process.env.DB_HOST || "").trim().toLowerCase();

    if (nodeEnv && !ALLOWED_NODE_ENVS.includes(nodeEnv)) {
        problems.push(
            `NODE_ENV="${nodeEnv}" is not one of ${ALLOWED_NODE_ENVS.join("/")}. Anything other than "production" ` +
            "makes the payment, SMS, WhatsApp and TRA integrations use their simulate providers - set NODE_ENV=production"
        );
    }

    if (nodeEnv !== "production" && dbHost && !LOCAL_DB_HOSTS.has(dbHost) && process.env.ALLOW_NON_LOCAL_DEV_DB !== "true") {
        problems.push(
            `NODE_ENV is "${nodeEnv || "(unset)"}" (not production) but DB_HOST is not local. A non-production process ` +
            "uses simulated payment/SMS/WhatsApp/TRA providers; set NODE_ENV=production, or ALLOW_NON_LOCAL_DEV_DB=true " +
            "if this is a deliberate shared staging database"
        );
    }

    return problems;
};

// Production-only security findings. Always reported as warnings; they stop
// startup only when STRICT_SECURITY_CHECKS=true, so an unattended deploy can
// never be taken down by them. Turn strict mode on once they are all clear.
// The three findings that leave the platform open to the internet are
// MANDATORY in production: unverified database TLS, no CORS_ORIGIN, and an
// unauthenticated payment webhook. They block startup unless the operator
// explicitly sets STRICT_SECURITY_CHECKS=false (a deliberate, logged opt-out).
exports.mandatoryProblems = () => {
    const problems = [];
    const env = process.env;
    if (env.NODE_ENV !== "production") return problems;
    if (String(env.DB_SSL).toLowerCase() === "true"
        && !env.DB_SSL_CA && !env.DB_SSL_CA_PATH && env.DB_SSL_REJECT_UNAUTHORIZED !== "true") {
        problems.push("DB_SSL is on but the database certificate is not verified (set DB_SSL_CA or DB_SSL_CA_PATH, or DB_SSL_REJECT_UNAUTHORIZED=true)");
    }
    if (!env.CORS_ORIGIN) {
        problems.push("CORS_ORIGIN is not set in production - the API would allow any origin");
    }
    if (String(env.MOBILE_MONEY_PROVIDER).toLowerCase() === "selcom"
        && !env.SELCOM_WEBHOOK_SECRET && !env.SELCOM_WEBHOOK_ALLOWED_IPS) {
        problems.push("MOBILE_MONEY_PROVIDER=selcom but neither SELCOM_WEBHOOK_SECRET nor SELCOM_WEBHOOK_ALLOWED_IPS is set - the Selcom webhook is open");
    }
    return problems;
};

exports.strictProblems = () => {
    const problems = [];
    if (process.env.NODE_ENV !== "production") return problems;
    const env = process.env;

    if (String(env.DB_SSL).toLowerCase() === "true"
        && !env.DB_SSL_CA && !env.DB_SSL_CA_PATH && env.DB_SSL_REJECT_UNAUTHORIZED !== "true") {
        problems.push("DB_SSL is on but the database certificate is not verified (set DB_SSL_CA or DB_SSL_CA_PATH, or DB_SSL_REJECT_UNAUTHORIZED=true)");
    }
    if (!env.CORS_ORIGIN) {
        problems.push("CORS_ORIGIN is not set in production - the API falls back to allowing any origin");
    }
    if ((env.JWT_SECRET || "").length < 32) {
        problems.push("JWT_SECRET is shorter than 32 characters in production");
    }
    if (String(env.MOBILE_MONEY_PROVIDER).toLowerCase() === "selcom" && !env.SELCOM_WEBHOOK_ALLOWED_IPS) {
        problems.push("MOBILE_MONEY_PROVIDER=selcom but SELCOM_WEBHOOK_ALLOWED_IPS is empty - the Selcom webhook accepts any source IP");
    }
    if (!env.PHONE_ENCRYPTION_KEY) {
        problems.push("PHONE_ENCRYPTION_KEY is not set - stored payer phone numbers are encrypted with a key derived from JWT_SECRET");
    }
    for (const name of ["ALLOW_UNSIGNED_WEBHOOKS", "ALLOW_PLATFORM_DATA_RESET", "ALLOW_PLATFORM_DATA_RESET_REAL", "LOADTEST_BYPASS_TOKEN", "PAWAPAY_ALLOW_UNSIGNED_CALLBACKS"]) {
        if (env[name]) problems.push(`${name} is set in production - it must only ever be used in local testing`);
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

// Called at boot by server.js and worker.js. Logs everything run() logs, then
// exits when a fatal condition exists, or - with STRICT_SECURITY_CHECKS=true -
// when a production security finding exists. `exit` is injectable for tests.
exports.enforce = (logger = console, exit = (code) => process.exit(code)) => {
    const problems = exports.run(logger);
    const fatal = exports.fatal();
    const optOut = process.env.STRICT_SECURITY_CHECKS === "false";
    const mandatory = optOut ? [] : exports.mandatoryProblems();
    if (optOut && exports.mandatoryProblems().length) {
        (logger.warn || logger.log)?.call(logger, "STRICT_SECURITY_CHECKS=false: mandatory production security checks are being SKIPPED");
    }
    const strict = process.env.STRICT_SECURITY_CHECKS === "true" ? exports.strictProblems() : [];
    const blocking = [...new Set([...fatal, ...mandatory, ...strict])];

    if (blocking.length) {
        const say = logger.fatal?.bind(logger) || logger.error?.bind(logger) || logger.log?.bind(logger);
        say?.(`Refusing to start: ${blocking.length} blocking configuration problem(s):`);
        blocking.forEach((problem) => say?.(`  - ${problem}`));
        exit(1);
    }
    return problems;
};
