#!/usr/bin/env node
// Read-only diagnostics for migration 126 (error: "Cannot add foreign key constraint").
// Connects with the same settings as migrate.js and prints the output needed to
// diagnose the failure. It changes nothing.
//
// Usage (from C:\nexora\database):   node diagnose-fk.js

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "..", "backend", ".env") });

const buildSslConfig = () => {
    if (process.env.DB_SSL_CA_PATH) return { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH).toString() };
    if (process.env.DB_SSL_CA) return { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n") };
    if (process.env.DB_SSL === "true") return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" };
    return undefined;
};

const queries = [
    ["Server version / sql_mode / FK checks", "SELECT @@version AS version, @@sql_mode AS sql_mode, @@foreign_key_checks AS fk_checks"],
    ["Latest foreign key error (InnoDB)", "SHOW ENGINE INNODB STATUS"],
    ["department_sponsorship_campaigns definition", "SHOW CREATE TABLE department_sponsorship_campaigns"],
    ["users definition", "SHOW CREATE TABLE users"],
    ["categories definition", "SHOW CREATE TABLE categories"],
    ["Foreign keys on department_sponsorship_campaigns", `
        SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'department_sponsorship_campaigns'
          AND REFERENCED_TABLE_NAME IS NOT NULL`],
    ["Columns already present on department_sponsorship_campaigns", `
        SELECT COLUMN_NAME, COLUMN_TYPE, GENERATION_EXPRESSION
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'department_sponsorship_campaigns'
        ORDER BY ORDINAL_POSITION`],
    ["Migrations recorded as applied (last 5)", "SELECT filename, applied_at FROM schema_migrations ORDER BY id DESC LIMIT 5"],
    ["dedupe log table exists?", "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'department_sponsorship_dedupe_log'"]
];

(async () => {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: buildSslConfig(),
        multipleStatements: false
    });

    try {
        for (const [title, sql] of queries) {
            console.log(`\n===== ${title} =====`);
            try {
                const [rows] = await connection.query(sql);
                if (Array.isArray(rows)) {
                    console.log(rows.length ? rows : "(no rows)");
                } else {
                    console.log(rows);
                }
            } catch (err) {
                console.log(`ERROR: ${err.message}`);
            }
        }
    } finally {
        await connection.end();
    }
})().catch((err) => {
    console.error("Could not connect:", err.message);
    process.exitCode = 1;
});
