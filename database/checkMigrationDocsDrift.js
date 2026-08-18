#!/usr/bin/env node

/**
 * NEXORA migration/docs drift check.
 *
 * Phase 6 (Database/DevOps CI Enforcement): RF6 (API & Architecture Docs)
 * fixed exactly one instance of database/migrations/ and
 * docs/DATABASE.md's migration count silently drifting apart - someone
 * added migration files without updating the doc's "N migrations as of
 * Phase X" line, and nothing caught it until a manual audit did. This
 * script is the automated version of that audit, meant to run on every
 * push/PR (see the "Manual steps required" section of
 * README-phase-P6.md for why it isn't wired into an actual CI workflow
 * yet - the .github/workflows/ directory this would normally live in
 * doesn't exist in this repo).
 *
 * What it checks: the highest NNN in database/migrations/NNN_*.sql
 * against the number docs/DATABASE.md's "N migrations as of Phase X"
 * line states. A mismatch in EITHER direction fails:
 *   - migrations ahead of the doc (RF6's original bug: someone merged a
 *     new migration and forgot to update the count)
 *   - the doc ahead of migrations (a less likely but equally real drift:
 *     someone bumped the documented count without actually adding the
 *     file, or a migration file was removed/renamed after the doc was
 *     last updated)
 *
 * Usage:
 *   node database/checkMigrationDocsDrift.js
 *
 * Exit code 0 = in sync, non-zero = drift detected (message explains
 * which direction and by how much). Deliberately has no database
 * connection and no dependency on the other scripts in this directory -
 * this only reads two things off disk, so it's safe to run in any
 * environment (including one with no DB reachable at all, like a CI
 * runner that hasn't provisioned a database) and runs in well under a
 * second.
 */

const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const DATABASE_DOC = path.join(__dirname, "..", "docs", "DATABASE.md");

// Matches e.g. "82 migrations as of Phase RF6 (API & Architecture Docs)"
// - the exact wording that's actually in docs/DATABASE.md today.
// Intentionally tolerant of what comes after the number/"migrations"
// (which phase, what's in parentheses) since that text will keep
// changing release to release; only the leading integer is load-bearing.
const DOC_COUNT_PATTERN = /(\d+)\s+migrations\s+as\s+of/i;

// Matches the "NNN_description.sql" convention documented at the top of
// migrate.js - a leading run of digits, then an underscore.
const MIGRATION_FILENAME_PATTERN = /^(\d+)_.+\.sql$/;

function getHighestMigrationNumber() {
    const files = fs.readdirSync(MIGRATIONS_DIR);
    const numbers = files
        .map((file) => file.match(MIGRATION_FILENAME_PATTERN))
        .filter(Boolean)
        .map((match) => parseInt(match[1], 10));

    if (numbers.length === 0) {
        throw new Error(`No migration files matching NNN_*.sql found in ${MIGRATIONS_DIR}`);
    }

    return Math.max(...numbers);
}

function getDocumentedMigrationCount() {
    const contents = fs.readFileSync(DATABASE_DOC, "utf8");
    const match = contents.match(DOC_COUNT_PATTERN);

    if (!match) {
        throw new Error(
            `Couldn't find a "N migrations as of ..." line in ${DATABASE_DOC}. ` +
            "Either the doc's wording changed (update DOC_COUNT_PATTERN in this " +
            "script to match) or the line was removed entirely."
        );
    }

    return parseInt(match[1], 10);
}

function main() {
    const highestMigration = getHighestMigrationNumber();
    const documentedCount = getDocumentedMigrationCount();

    if (highestMigration === documentedCount) {
        console.log(
            `OK: database/migrations/ (highest: ${highestMigration}) matches ` +
            `docs/DATABASE.md's documented count (${documentedCount}).`
        );
        process.exit(0);
    }

    if (highestMigration > documentedCount) {
        console.error(
            `DRIFT: database/migrations/ has migrations up to ${highestMigration}, ` +
            `but docs/DATABASE.md still says ${documentedCount}. ` +
            `Update the "N migrations as of Phase X" line in docs/DATABASE.md ` +
            `(and its accompanying summary of what the new migration(s) added) ` +
            `to match.`
        );
        process.exit(1);
    }

    console.error(
        `DRIFT: docs/DATABASE.md claims ${documentedCount} migrations, but the ` +
        `highest migration file present is only ${highestMigration}. Either a ` +
        `migration file was removed/renamed after the doc was last updated, or ` +
        `the doc's count was bumped without the corresponding migration actually ` +
        `being added - either way, fix whichever one is wrong.`
    );
    process.exit(1);
}

main();
