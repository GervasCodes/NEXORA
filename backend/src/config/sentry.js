// Sentry error tracking for the backend. Required by the Node SDK to be
// imported/initialized as early as possible - see server.js, which
// requires this module before anything else (including `./src/app`) so
// Sentry's automatic instrumentation (http, express) can hook in before
// those modules are loaded.
//
// Same "degrade gracefully when unconfigured" pattern as brevo.js:
// Sentry.init() is skipped entirely when SENTRY_DSN isn't set, so local
// dev and CI never need a real DSN. Every other Sentry.* call
// (captureException, setupExpressErrorHandler, etc.) is still safe to
// call unconditionally elsewhere in the app even when init() never ran -
// the SDK just drops the event instead of sending it, so callers never
// need to check "is Sentry configured?" themselves.
const Sentry = require("@sentry/node");

const dsn = process.env.SENTRY_DSN;

if (dsn) {
    Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
        // Release tagging is optional - set SENTRY_RELEASE (e.g. to the
        // deployed commit SHA) in CI/CD if you want errors grouped by
        // release. Left unset by default since nothing here has access
        // to the git SHA at runtime.
        release: process.env.SENTRY_RELEASE || undefined,
        // Trace sampling is deliberately low/off by default - this app
        // cares about error tracking first; performance tracing is a
        // separate, explicit opt-in (raise SENTRY_TRACES_SAMPLE_RATE)
        // once error monitoring itself is proven out, to avoid eating
        // into Sentry's free-tier event quota on a JSON API that's
        // already got its own request logging (see requestLogger
        // middleware).
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0)
    });
} else if (process.env.NODE_ENV === "production") {
    // Loud, not silent - same reasoning as mobileMoney.provider.js's
    // simulate-mode banner: shipping production without error tracking
    // configured should be an unmissable choice, not an accident.
    // eslint-disable-next-line no-console
    console.warn("[sentry] SENTRY_DSN is not set - error tracking is disabled in production.");
}

module.exports = Sentry;
