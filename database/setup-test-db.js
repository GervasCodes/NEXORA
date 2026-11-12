#!/usr/bin/env node
/**
 * Creates the throwaway test database and user used by the backend's
 * db-integration suite (backend/tests/db-integration), on MySQL 8 or MariaDB.
 *
 * setup-test-db.sql uses `IDENTIFIED WITH mysql_native_password BY ...`, which
 * is MySQL-only and fails on MariaDB. This script checks which server it is
 * talking to and runs the matching statements.
 *
 *   node setup-test-db.js                       # connects as root on localhost, no password
 *   ROOT_USER=root ROOT_PASSWORD=secret DB_HOST=127.0.0.1 DB_PORT=3306 node setup-test-db.js
 *   DB_SOCKET=/run/mysqld/mysqld.sock node setup-test-db.js   # root with unix-socket auth
 *
 * Then: DB_HOST=127.0.0.1 DB_USER=test DB_PASSWORD=test DB_NAME=nexora_test node migrate.js
 *       cd ../backend && npm run test:db
 *
 * Only ever creates `nexora_test` and the `test` user. Never run against a
 * production server.
 */
const mysql = require("mysql2/promise");

(async () => {
    // DB_SOCKET (for example /run/mysqld/mysqld.sock) is for servers whose root
    // account only accepts unix-socket logins, which is the default on many Linux installs.
    const connection = await mysql.createConnection({
        ...(process.env.DB_SOCKET
            ? { socketPath: process.env.DB_SOCKET }
            : { host: process.env.DB_HOST || "127.0.0.1", port: Number(process.env.DB_PORT || 3306) }),
        user: process.env.ROOT_USER || "root",
        password: process.env.ROOT_PASSWORD || "",
        multipleStatements: false
    });

    const [[{ version }]] = await connection.query("SELECT VERSION() AS version");
    const isMaria = /mariadb/i.test(version);
    const auth = isMaria ? "IDENTIFIED BY 'test'" : "IDENTIFIED WITH mysql_native_password BY 'test'";

    const statements = [
        "CREATE DATABASE IF NOT EXISTS nexora_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
        `CREATE USER IF NOT EXISTS 'test'@'localhost' ${auth}`,
        `CREATE USER IF NOT EXISTS 'test'@'127.0.0.1' ${auth}`,
        "GRANT ALL PRIVILEGES ON nexora_test.* TO 'test'@'localhost'",
        "GRANT ALL PRIVILEGES ON nexora_test.* TO 'test'@'127.0.0.1'",
        "FLUSH PRIVILEGES"
    ];
    for (const statement of statements) await connection.query(statement);

    console.log(`Test database ready on ${isMaria ? "MariaDB" : "MySQL"} ${version}: database nexora_test, user test.`);
    await connection.end();
})().catch((error) => {
    console.error(`Could not set up the test database: ${error.message}`);
    process.exit(1);
});
