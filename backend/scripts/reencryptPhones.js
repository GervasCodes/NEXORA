#!/usr/bin/env node
/**
 * Converts stored payer phone numbers (payments.payer_phone_encrypted) to the
 * current encryption format and key (see src/utils/phoneEncryption.js).
 *
 *   node scripts/reencryptPhones.js            dry run: counts only, writes nothing
 *   node scripts/reencryptPhones.js --apply    rewrites rows that are not yet in the
 *                                              current format
 *
 * Safe to re-run. Rows that cannot be decrypted are left untouched and
 * reported. TAKE A DATABASE BACKUP FIRST. Never prints phone numbers.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const db = require("../src/config/db");
const { isV2, reencryptPhone } = require("../src/utils/phoneEncryption");

const apply = process.argv.includes("--apply");
const wantV2 = Boolean(process.env.PHONE_ENCRYPTION_KEY);

(async () => {
    if (!wantV2) {
        console.error("PHONE_ENCRYPTION_KEY is not set; there is nothing to convert to. Set it first.");
        process.exit(2);
    }
    const [rows] = await db.query("SELECT id, payer_phone_encrypted AS value FROM payments WHERE payer_phone_encrypted IS NOT NULL");
    let toConvert = 0, converted = 0, unreadable = 0, alreadyCurrent = 0;
    const currentPrefix = `v2:${(process.env.PHONE_ENCRYPTION_KEY_ID || "k1").replace(/[^A-Za-z0-9_-]/g, "") || "k1"}:`;

    for (const row of rows) {
        if (isV2(row.value) && row.value.startsWith(currentPrefix)) { alreadyCurrent += 1; continue; }
        const next = reencryptPhone(row.value);
        if (next === null) { unreadable += 1; continue; }
        toConvert += 1;
        if (apply) {
            await db.query("UPDATE payments SET payer_phone_encrypted = ? WHERE id = ? AND payer_phone_encrypted = ?", [next, row.id, row.value]);
            converted += 1;
        }
    }
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", total: rows.length, alreadyCurrent, toConvert, converted, unreadable }));
    process.exit(0);
})().catch((error) => { console.error(error.message); process.exit(1); });
