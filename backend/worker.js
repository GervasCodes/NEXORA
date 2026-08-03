// Phase 4 (Engineering & Scalability) - dedicated worker process for
// scheduled jobs (escrow release, booking lifecycle, sponsorship expiry,
// etc. - see src/jobs/index.js). Previously these all ran inside
// server.js's own process alongside the HTTP server, which meant:
//
//   - jobs competed with request handling for the same event loop/DB
//     pool, and a slow job tick could add latency to in-flight requests
//     (or vice versa - a traffic spike delaying a job tick);
//   - the web process couldn't be scaled horizontally (2+ instances)
//     without every instance also running its own copy of every cron
//     job, multiplying escrow releases/notifications/etc.
//
// Running `node worker.js` as its own process (a separate Render
// "Background Worker" / separate Docker service / separate PM2
// process - see docs/DEPLOYMENT.md and docs/SCALABILITY_REPORT.md) does
// none of that: it holds its own small DB pool, schedules the exact same
// jobs via the exact same src/jobs/index.js used before, and the
// per-job MySQL advisory lock in src/utils/dbLock.js (see jobs/index.js)
// means it's now also safe to run more than one worker replica at once
// for redundancy - only one replica's tick actually executes a given
// job; the rest skip it silently.
//
// Backward compatibility: nothing about this file is required. The web
// process (server.js) still runs jobs in-process by default exactly as
// before - see the RUN_JOBS_IN_PROCESS guard there - so an existing
// single-process deployment that never adds this worker keeps working
// unchanged. Once a separate worker is deployed, set
// RUN_JOBS_IN_PROCESS=false on the web process(es) so jobs run in
// exactly one place (the worker) instead of running twice (redundantly,
// though still safely - the advisory lock would just make the web
// process's copy a no-op skip on every tick).
const Sentry = require("./src/config/sentry");

const { startJobs } = require("./src/jobs");
const logger = require("./src/utils/logger").child({ process: "worker" });
const envCheck = require("./src/config/envCheck");

process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "[unhandledRejection]");
    Sentry.captureException(reason);
});

process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "[uncaughtException] shutting down for a clean restart");
    Sentry.captureException(error);
    process.exit(1);
});

envCheck.run(logger);

startJobs();

logger.info("🕒 Worker process running (scheduled jobs only, no HTTP server)");

// No explicit keepalive needed here - node-cron's scheduled tasks use
// real timers internally, which already hold the Node event loop open
// (verified: a bare `cron.schedule(...)` with nothing else keeps the
// process running indefinitely, the same way an open http.Server does).
