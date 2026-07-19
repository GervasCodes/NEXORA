#!/usr/bin/env node

/**
 * NEXORA database backup script.
 *
 * Satisfies SRS 3.9 (Backup and Recovery): "Support regular database
 * backups. Allow restoration of data from backups in case of failure."
 *
 * Shells out to `mysqldump` (reads the same DB_HOST/DB_PORT/DB_USER/
 * DB_PASSWORD/DB_NAME from backend/.env that migrate.js uses) and writes
 * a timestamped, gzip-compressed dump to database/backups/.
 *
 * Usage:
 *   node database/backup.js                 dump to database/backups/
 *   node database/backup.js --out <dir>      dump to a custom directory
 *
 * Restore with database/restore.js (see that file for usage).
 *
 * For "regular" backups in production, schedule this with cron or your
 * host's scheduled-jobs feature, e.g. a nightly cron entry:
 *   0 2 * * *  cd /path/to/NEXORA/database && node backup.js
 * and ship database/backups/ off-box (S3, another disk, etc.) - a backup
 * that lives on the same machine as the database it protects only
 * survives most of the failures worth protecting against.
 */

const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, "..", "backend", ".env") });

const args = process.argv.slice(2);
const outFlagIndex = args.indexOf("--out");
const outDir = outFlagIndex !== -1 && args[outFlagIndex + 1]
    ? args[outFlagIndex + 1]
    : path.join(__dirname, "backups");

const {
    DB_HOST,
    DB_PORT = "3306",
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    DB_SSL,
    DB_SSL_CA_PATH
} = process.env;

if (!DB_HOST || !DB_USER || !DB_NAME) {
    console.error("Missing DB_HOST / DB_USER / DB_NAME - check backend/.env");
    process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const filename = `nexora_${DB_NAME}_${timestamp}.sql.gz`;
const filepath = path.join(outDir, filename);

const mysqldumpArgs = [
    `-h${DB_HOST}`,
    `-P${DB_PORT}`,
    `-u${DB_USER}`,
    "--single-transaction", // consistent snapshot without locking InnoDB tables
    "--routines",
    "--triggers",
    "--events",
    DB_NAME
];

if (DB_SSL === "true") {
    mysqldumpArgs.push("--ssl-mode=REQUIRED");
    if (DB_SSL_CA_PATH) {
        mysqldumpArgs.push(`--ssl-ca=${DB_SSL_CA_PATH}`);
    }
}

console.log(`Backing up "${DB_NAME}" from ${DB_HOST} -> ${filepath}`);

try {
    // Password passed via env (MYSQL_PWD), never as a CLI arg - CLI args
    // are visible to any other process on the box via `ps`; env vars
    // passed this way to a child process are not.
    const dumpBuffer = execFileSync("mysqldump", mysqldumpArgs, {
        env: { ...process.env, MYSQL_PWD: DB_PASSWORD || "" },
        maxBuffer: 1024 * 1024 * 1024 // 1GB - large product/order tables can produce a big dump
    });

    const zlib = require("zlib");
    fs.writeFileSync(filepath, zlib.gzipSync(dumpBuffer));

    console.log(`Backup complete: ${filepath} (${(fs.statSync(filepath).size / 1024 / 1024).toFixed(2)} MB)`);
} catch (error) {
    if (error.code === "ENOENT") {
        console.error(
            "mysqldump not found. Install the MySQL/MariaDB client tools " +
            "(e.g. `apt install mysql-client` or `brew install mysql-client`) and try again."
        );
    } else {
        console.error("Backup failed:", error.message);
    }
    process.exit(1);
}
