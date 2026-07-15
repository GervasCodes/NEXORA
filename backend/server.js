const http = require("http");
const app = require("./src/app");
const socket = require("./src/socket/socket");
const { startJobs } = require("./src/jobs");

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
// outage with no diagnosis" for "brief restart, logged".
process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (error) => {
    console.error("[uncaughtException] shutting down for a clean restart:", error);
    process.exit(1);
});

const PORT = process.env.PORT || 5000;

const httpServer = http.createServer(app);

socket.init(httpServer);
startJobs();

httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
