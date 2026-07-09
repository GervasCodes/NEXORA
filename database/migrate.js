#!/usr/bin/env node

/**
 * NEXORA migration runner.
 *
 * Applies every .sql file in ./migrations, in filename order, that hasn't
 * been applied yet. Tracks progress in a `schema_migrations` table so it's
 * safe to re-run on every deploy.
 *
 * Usage:
 *   node database/migrate.js            run all pending migrations
 *   node database/migrate.js --status   list applied / pending migrations
 *   node database/seed.js               populate reference/dev data (separate script)
 *
 * Reads DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME from the
 * backend's .env (see backend/.env.example).
 */

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "..", "backend", ".env") });

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

// Same SSL handling as backend/src/config/db.js - see the comment there.
// Duplicated rather than shared since database/ and backend/ are separate
// npm packages with their own node_modules.
const buildSslConfig = () => {
    if (process.env.DB_SSL_CA_PATH) {
        return { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH).toString() };
    }
    if (process.env.DB_SSL_CA) {
        return { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n") };
    }
    return undefined;
};

async function getConnection() {
    return mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: buildSslConfig(),
        multipleStatements: true
    });
}

async function ensureMigrationsTable(connection) {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filename VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

function getMigrationFiles() {
    return fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();
}

async function getAppliedFilenames(connection) {
    const [rows] = await connection.query(
        "SELECT filename FROM schema_migrations"
    );
    return new Set(rows.map((r) => r.filename));
}

async function run() {
    const showStatusOnly = process.argv.includes("--status");
    const connection = await getConnection();

    try {
        await ensureMigrationsTable(connection);

        const allFiles = getMigrationFiles();
        const applied = await getAppliedFilenames(connection);
        const pending = allFiles.filter((f) => !applied.has(f));

        if (showStatusOnly) {
            console.log("Applied migrations:");
            allFiles
                .filter((f) => applied.has(f))
                .forEach((f) => console.log(`  [x] ${f}`));
            console.log("Pending migrations:");
            pending.forEach((f) => console.log(`  [ ] ${f}`));
            return;
        }

        if (pending.length === 0) {
            console.log("Database is up to date. No pending migrations.");
            return;
        }

        for (const filename of pending) {
            const filePath = path.join(MIGRATIONS_DIR, filename);
            const sql = fs.readFileSync(filePath, "utf8");

            console.log(`Applying ${filename}...`);
            await connection.query(sql);
            await connection.query(
                "INSERT INTO schema_migrations (filename) VALUES (?)",
                [filename]
            );
            console.log(`  done.`);
        }

        console.log(`Applied ${pending.length} migration(s) successfully.`);
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await connection.end();
    }
}

run();
