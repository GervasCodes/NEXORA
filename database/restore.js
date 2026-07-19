#!/usr/bin/env node

/**
 * NEXORA database restore script - the other half of SRS 3.9
 * (Backup and Recovery). Restores a .sql.gz dump produced by backup.js
 * back into the database named in backend/.env.
 *
 * Usage:
 *   node database/restore.js <path-to-backup.sql.gz>
 *   node database/restore.js --latest             restore the newest file in database/backups/
 *
 * This OVERWRITES the target database's tables with the backup's
 * contents. It does not drop/recreate the database itself - run this
 * against an empty or disposable database if you want a truly clean
 * restore, or accept that any table not present in the backup is left
 * untouched.
 */

const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, "..", "backend", ".env") });

const args = process.argv.slice(2);

const backupsDir = path.join(__dirname, "backups");

const resolveBackupPath = () => {
    if (args[0] === "--latest") {
        if (!fs.existsSync(backupsDir)) {
            console.error(`No backups directory found at ${backupsDir}`);
            process.exit(1);
        }
        const files = fs.readdirSync(backupsDir)
            .filter((f) => f.endsWith(".sql.gz"))
            .sort(); // ISO timestamp in the filename sorts chronologically
        if (!files.length) {
            console.error(`No .sql.gz backups found in ${backupsDir}`);
            process.exit(1);
        }
        return path.join(backupsDir, files[files.length - 1]);
    }

    if (!args[0]) {
        console.error("Usage: node database/restore.js <path-to-backup.sql.gz> | --latest");
        process.exit(1);
    }

    return path.resolve(args[0]);
};

const backupPath = resolveBackupPath();

if (!fs.existsSync(backupPath)) {
    console.error(`Backup file not found: ${backupPath}`);
    process.exit(1);
}

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

console.log(`Restoring ${backupPath} -> "${DB_NAME}" on ${DB_HOST}`);
console.log("This will overwrite any existing tables of the same name. Ctrl+C now to abort.");

const mysqlArgs = [
    `-h${DB_HOST}`,
    `-P${DB_PORT}`,
    `-u${DB_USER}`,
    DB_NAME
];

if (DB_SSL === "true") {
    mysqlArgs.push("--ssl-mode=REQUIRED");
    if (DB_SSL_CA_PATH) {
        mysqlArgs.push(`--ssl-ca=${DB_SSL_CA_PATH}`);
    }
}

try {
    const sql = zlib.gunzipSync(fs.readFileSync(backupPath));

    execFileSync("mysql", mysqlArgs, {
        input: sql,
        env: { ...process.env, MYSQL_PWD: DB_PASSWORD || "" },
        maxBuffer: 1024 * 1024 * 1024,
        stdio: ["pipe", "inherit", "inherit"]
    });

    console.log("Restore complete.");
} catch (error) {
    if (error.code === "ENOENT") {
        console.error(
            "mysql client not found. Install the MySQL/MariaDB client tools " +
            "(e.g. `apt install mysql-client` or `brew install mysql-client`) and try again."
        );
    } else {
        console.error("Restore failed:", error.message);
    }
    process.exit(1);
}
