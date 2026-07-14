const fs = require("fs");
const mysql = require("mysql2/promise");
require("dotenv").config();


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
