const crypto = require("crypto");

// One opaque reference per payment ATTEMPT, e.g. ORDER-42-9F3A61C0D2B7.
// The numeric id keeps webhook routing working (the prefix says which
// handler owns it); the random suffix is stored on the payment row
// (payments.payment_reference, unique) and is what a callback is matched
// against - so a late callback from attempt 1 can only ever touch
// attempt 1's row, never attempt 2's.
const PREFIXES = {
    order: "ORDER",
    booking: "BOOKING",
    subscription: "SUB",
    topup: "TOPUP"
};

const KIND_BY_PREFIX = Object.fromEntries(Object.entries(PREFIXES).map(([kind, prefix]) => [prefix, kind]));

exports.build = (kind, id) => {
    const prefix = PREFIXES[kind];
    if (!prefix) throw new Error(`Unknown payment reference kind: ${kind}`);
    return `${prefix}-${id}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
};

// Accepts both the new shape and the old ORDER-<id> / BOOKING-<id> /
// SUB-<id> / TOPUP-<id> shape, so payments already in flight when this
// ships still resolve (legacy: true - no per-attempt row to match, callers
// fall back to "latest payment row for this id").
exports.parse = (reference) => {
    const match = /^(ORDER|BOOKING|SUB|TOPUP)-(\d+)(?:-([A-Fa-f0-9]{12}))?$/.exec(String(reference || ""));
    if (!match) return null;

    return {
        kind: KIND_BY_PREFIX[match[1]],
        id: Number(match[2]),
        suffix: match[3] || null,
        legacy: !match[3],
        reference: match[0]
    };
};
