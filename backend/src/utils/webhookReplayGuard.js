// Webhook replay protection (Phase 2 - Security Hardening).
//
// Signature/shared-secret verification (webhookAuth.middleware.js,
// snippe.provider.js#constructWebhookEvent) proves a request really came
// from the provider - it does NOT prove this is the first and only time
// that exact request has been delivered. A captured, validly-signed
// payload replayed later would still pass those checks (see
// docs/WEBHOOK_VALIDATION.md #6). Two independent guards close that gap:
//
//   1. Timestamp freshness - if the provider's payload includes its own
//      timestamp (MalipoPay does; Selcom/Snippe's documented shapes
//      don't), reject anything outside a tolerance window of "now".
//   2. Payload-hash dedup - SHA-256(provider + raw bytes) recorded in
//      `webhook_replay_guard` (migration 072). A UNIQUE constraint means
//      a second delivery of the exact same bytes is rejected regardless
//      of whether that provider gives us a timestamp/nonce at all - this
//      is the provider-shape-agnostic half of the protection.
//
// Both are applied in addition to, not instead of, the existing
// signature/secret check - a request must pass its provider's own auth
// FIRST; this module only decides whether an already-authenticated
// request is a fresh delivery or a replay.
const crypto = require("crypto");
const db = require("../config/db");
const logger = require("./logger");

// Generous enough for real network/provider clock drift, short enough
// that a captured-and-replayed request (the scenario this exists for)
// is rejected on its own rather than relying solely on the hash-dedup
// check below.
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

// Accepts a unix timestamp in seconds, milliseconds, or an ISO/parsable
// date string - MalipoPay's documented format is a compact
// "yyyyMMddHHmmss" string (see the integration test fixtures), so this
// also tries that shape explicitly before falling back to Date.parse.
const toEpochMs = (value) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    if (typeof value === "number") {
        return value < 1e12 ? value * 1000 : value;
    }

    const str = String(value);

    // yyyyMMddHHmmss (MalipoPay's documented webhook timestamp format)
    const compactMatch = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(str);
    if (compactMatch) {
        const [, year, month, day, hour, minute, second] = compactMatch;
        return Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second)
        );
    }

    if (/^\d+$/.test(str)) {
        const numeric = Number(str);
        return numeric < 1e12 ? numeric * 1000 : numeric;
    }

    const parsed = Date.parse(str);
    return Number.isNaN(parsed) ? null : parsed;
};

// Returns true if the timestamp is missing (nothing to check - the
// payload-hash dedup below is this provider's only replay guard) or
// falls within the tolerance window of "now". Returns false only when a
// timestamp IS present and is stale/in-the-future beyond the window -
// that's an explicit rejection reason distinct from "no timestamp to
// check at all".
exports.isTimestampFresh = (timestampValue) => {
    if (timestampValue === null || timestampValue === undefined || timestampValue === "") {
        // Nothing to check - this provider's payload doesn't carry a
        // timestamp at all, so the payload-hash dedup in recordDelivery
        // is this delivery's only replay guard.
        return true;
    }

    const epochMs = toEpochMs(timestampValue);

    if (epochMs === null) {
        // The field IS present but not in any recognized shape - fail
        // closed rather than silently treating garbage as "nothing to
        // check". A well-behaved provider never sends this; a forged or
        // tampered-with payload might.
        return false;
    }

    return Math.abs(Date.now() - epochMs) <= REPLAY_WINDOW_MS;
};

// Records this exact (provider, payload) pair as seen. Returns `true` if
// this is the first time (caller should proceed) or `false` if it's a
// replay of something already recorded (caller should reject). `raw`
// should be the most stable representation available - the raw request
// body bytes/string where possible, so this doesn't depend on JSON key
// ordering being preserved.
exports.recordDelivery = async (provider, raw) => {
    const payload = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), "utf8");
    const payloadHash = crypto.createHash("sha256").update(provider).update(payload).digest("hex");

    try {
        await db.query(
            "INSERT INTO webhook_replay_guard (provider, payload_hash) VALUES (?, ?)",
            [provider, payloadHash]
        );
        return true;
    } catch (error) {
        if (error && error.code === "ER_DUP_ENTRY") {
            logger.warn({ provider }, "[webhook replay guard] rejected duplicate/replayed webhook payload");
            return false;
        }
        // A DB error here isn't a replay - surface it like any other
        // infra failure rather than silently treating it as one.
        throw error;
    }
};
