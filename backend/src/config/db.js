const fs = require("fs");
const mysql = require("mysql2/promise");
require("dotenv").config();


const buildSslConfig = () => {
    // Full certificate validation, if you have the host's CA cert -
    // strongest option, use this if your provider gives you one.
    if (process.env.DB_SSL_CA_PATH) {
        return { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH).toString() };
    }

    if (process.env.DB_SSL_CA) {
        return { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n") };
    }

    // DB_SSL=true with no CA - the common case for most managed MySQL
    // (PlanetScale, Aiven, RDS, DigitalOcean managed DB, etc.), which
    // terminate TLS with a cert you don't have a local CA file for.
    // DB_SSL_REJECT_UNAUTHORIZED=false skips validating that cert chain
    // (still encrypts the connection, just doesn't verify the server's
    // identity) - set to true only once you've set up DB_SSL_CA properly.
    if (process.env.DB_SSL === "true") {
        return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" };
    }

    return undefined;
};

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: buildSslConfig(),
    waitForConnections: true,
    connectionLimit: 10
});

// A dropped/reset connection at the pool level (not a query - those
// already throw and get caught by each controller's try/catch) fires
// here instead of becoming an unhandled error that would trip server.js's
// uncaughtException handler and kill the whole process over what's
// usually just a transient network blip. mysql2's pool recovers and
// creates a new connection on the next query automatically either way -
// this only affects whether that recovery is silent+crashy or logged+safe.
pool.on("error", (error) => {
    console.error("[db pool error]", error.message);
});

module.exports = pool;
