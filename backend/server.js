// Sentry must be imported/initialized before anything else - including
// `./src/app` - so its automatic instrumentation can hook into `http`
// and `express` before those modules are required elsewhere. See
// src/config/sentry.js for the "no-op when SENTRY_DSN unset" behavior.
const Sentry = require("./src/config/sentry");

const http = require("http");
const app = require("./src/app");
const socket = require("./src/socket/socket");
const { startJobs } = require("./src/jobs");
const logger = require("./src/utils/logger");
const paymentProviderRegistry = require("./src/modules/payment/providers/registry");
const envCheck = require("./src/config/envCheck");

// Without these, a single unhandled promise rejection or uncaught
// exception ANYWHERE in the app - a socket event handler, a cron job
// that slipped past its own try/catch, a fire-and-forget call someone
// adds later without a .catch() - crashes the entire Node process for
// every user currently on the site, and by default logs nothing useful
// about where it came from. Logging here at least gives a diagnosable
// trail; exiting on uncaughtException (not unhandledRejection) is
// intentional - Node's own docs recommend against trying to keep running
// after a truly uncaught synchronous exception, since the process may be
// in a corrupted state. Render (or any process manager) restarts the
// process automatically after an exit, so this trades "silent full
// outage with no diagnosis" for "brief restart, logged". Both are also
// reported to Sentry (a no-op if SENTRY_DSN isn't set) since a process-
// level crash is exactly the kind of thing that should page someone,
// not just sit in a log line no one's watching.
process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "[unhandledRejection]");
    Sentry.captureException(reason);
});

process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "[uncaughtException] shutting down for a clean restart");
    Sentry.captureException(error);
    process.exit(1);
});

const PORT = process.env.PORT || 5000;

const httpServer = http.createServer(app);

socket.init(httpServer);
startJobs();

// Phase 5 (Resilience & Growth): catch a malformed payment-provider entry
// (bad merge, renamed export) at boot rather than mid-checkout. Warn-only
// - an unconfigured rail (no credentials set, normal in dev) is not an
// error and must never block startup.
paymentProviderRegistry.validateRegistry(logger);

// Phase 1 (Launch Blockers): catches typo'd/misconfigured env vars (e.g.
// AADMIN_EMAIL instead of ADMIN_EMAIL) loudly at boot instead of as
// silent downstream behavior - see src/config/envCheck.js.
envCheck.run(logger);

httpServer.listen(PORT, () => {
    logger.info({ port: PORT }, "🚀 Server running");
});
