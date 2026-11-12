/**
 * phoneEncryption.js (Phase 5, P0).
 *
 * Mobile-money booking refunds (payment.service.js#refundBookingPayment)
 * need the buyer's phone number to push a refund back out - the number
 * they paid *from*, which can differ from the booking's own contact
 * details and was previously only ever held in memory for the duration
 * of the initial payment request, never persisted. That made every
 * mobile-money booking refund a manual, "please process this by hand"
 * case. This stores it encrypted on the payment row (payer_phone_encrypted,
 * migration 122) instead of in the clear, since a phone number is PII
 * and this column exists purely for an automated refund to read back,
 * not for display.
 *
 * AES-256-GCM. Two formats exist, and both stay readable:
 *
 *   legacy  `iv.tag.data`            key = SHA-256(JWT_SECRET)
 *   v2      `v2:<keyId>:iv.tag.data` key = SHA-256("nexora:phone:v2:" + PHONE_ENCRYPTION_KEY)
 *
 * With no PHONE_ENCRYPTION_KEY configured nothing changes: new values are
 * written in the legacy format. Once PHONE_ENCRYPTION_KEY is set, new values
 * are written as v2, so the phone data no longer depends on JWT_SECRET (a
 * leaked or rotated session secret no longer exposes or destroys it).
 * Existing legacy values keep decrypting with the JWT-derived key until they
 * are converted with `node scripts/reencryptPhones.js --apply`.
 *
 * Rotation: set PHONE_ENCRYPTION_KEY to the new key, move the old one to
 * PHONE_ENCRYPTION_KEY_PREVIOUS (and give the new one a new
 * PHONE_ENCRYPTION_KEY_ID), then run the re-encryption script.
 */

const crypto = require("crypto");

const V2_PREFIX = "v2:";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest();

// Legacy key: derived from the session secret (kept so old rows stay readable).
const legacyKey = () => sha256(String(process.env.JWT_SECRET || ""));

const dedicatedKey = (secret) => sha256(`nexora:phone:v2:${secret}`);

const currentKeyId = () => (process.env.PHONE_ENCRYPTION_KEY_ID || "k1").replace(/[^A-Za-z0-9_-]/g, "") || "k1";

const seal = (key, phone) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(String(phone), "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // iv.authTag.ciphertext, each base64 - self-contained, no separate
    // column needed for the IV/tag.
    return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
};

const open = (key, body) => {
    const [ivB64, tagB64, dataB64] = body.split(".");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
};

exports.isV2 = (payload) => typeof payload === "string" && payload.startsWith(V2_PREFIX);

exports.encryptPhone = (phone) => {
    if (!phone) return null;
    if (process.env.PHONE_ENCRYPTION_KEY) {
        return `${V2_PREFIX}${currentKeyId()}:${seal(dedicatedKey(process.env.PHONE_ENCRYPTION_KEY), phone)}`;
    }
    return seal(legacyKey(), phone);
};

exports.decryptPhone = (payload) => {
    if (!payload) return null;
    try {
        if (exports.isV2(payload)) {
            const body = payload.split(":").slice(2).join(":");
            const candidates = [process.env.PHONE_ENCRYPTION_KEY, process.env.PHONE_ENCRYPTION_KEY_PREVIOUS].filter(Boolean);
            for (const secret of candidates) {
                try {
                    return open(dedicatedKey(secret), body);
                } catch {
                    // try the next key
                }
            }
            return null;
        }
        return open(legacyKey(), payload);
    } catch {
        return null;
    }
};

// For the re-encryption script: returns the payload in the current format, or
// null when it cannot be decrypted (the script then leaves the row alone).
exports.reencryptPhone = (payload) => {
    const plain = exports.decryptPhone(payload);
    return plain === null ? null : exports.encryptPhone(plain);
};
