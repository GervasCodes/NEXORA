-- NEXORA test database setup for XAMPP / local MySQL
-- ----------------------------------------------------
-- Replaces the old disposable Docker MySQL (docker-compose.test.yml) for
-- running the backend's real-database integration tests
-- (backend/tests/db-integration/**).
--
-- These credentials match backend/tests/setupEnv.js's fallback defaults
-- (DB_HOST=localhost, DB_PORT=3306, DB_USER=test, DB_PASSWORD=test,
-- DB_NAME=nexora_test), so no backend/.env changes are needed to run
-- the db-integration suite locally after this script has been run once.
--
-- How to run this (XAMPP):
--   1. Start the XAMPP Control Panel and click "Start" next to MySQL.
--   2. Open phpMyAdmin (http://localhost/phpmyadmin), click the "SQL"
--      tab, paste the contents of this file, and click "Go".
--      -- OR, from a terminal --
--      "C:\xampp\mysql\bin\mysql.exe" -u root < database\setup-test-db.sql
--      (macOS/Linux XAMPP: /Applications/XAMPP/xamppfiles/bin/mysql -u root < database/setup-test-db.sql)
--   3. Apply migrations to the new nexora_test database (this is a
--      separate DB from whatever backend/.env points at, so set the
--      test credentials inline for this one command rather than using
--      `npm run db:migrate`, which reads backend/.env):
--
--        cd database && npm install
--        DB_HOST=localhost DB_PORT=3306 DB_USER=test DB_PASSWORD=test DB_NAME=nexora_test node migrate.js
--
--      (Windows cmd.exe instead of bash/PowerShell? set each var first:
--        set DB_HOST=localhost&& set DB_PORT=3306&& set DB_USER=test&& set DB_PASSWORD=test&& set DB_NAME=nexora_test&& node migrate.js )
--
--   4. Run the suite:
--
--        cd ../backend && npm run test:db
--
-- Unlike the Docker version, this database persists across runs (XAMPP's
-- MySQL data directory, not a tmpfs volume). tests/db-integration's
-- resetTables() helper (see backend/tests/db-integration/helpers/dbFixtures.js)
-- clears rows between test files, but the schema itself stays in place -
-- re-run this script any time you want a totally clean slate.

CREATE DATABASE IF NOT EXISTS nexora_test
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- MySQL 8's default auth plugin (caching_sha2_password) isn't always
-- supported by older Node mysql2 builds' default settings; mysql_native_password
-- keeps this working out of the box on a stock XAMPP install.
CREATE USER IF NOT EXISTS 'test'@'localhost' IDENTIFIED WITH mysql_native_password BY 'test';
CREATE USER IF NOT EXISTS 'test'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY 'test';

GRANT ALL PRIVILEGES ON nexora_test.* TO 'test'@'localhost';
GRANT ALL PRIVILEGES ON nexora_test.* TO 'test'@'127.0.0.1';

FLUSH PRIVILEGES;
