const fs = require("fs");
const mysql = require("mysql2/promise");
require("dotenv").config();

// Aiven (and most managed MySQL hosts) require SSL/TLS. Provide the CA
// certificate one of two ways:
//   - DB_SSL_CA_PATH: path to a mounted file (e.g. Render "Secret File")
//   - DB_SSL_CA: the certificate's PEM content directly, as an env var
//     (use `\n` for line breaks if pasting into a single-line env var UI)
// If neither is set, SSL is skipped entirely - fine for local dev against
// a plain local MySQL install, but Aiven will reject the connection.
const buildSslConfig = () => {
    if (process.env.DB_SSL_CA_PATH) {
        return { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH).toString() };
    }

    if (process.env.DB_SSL_CA) {
        return { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n") };
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

module.exports = pool;
