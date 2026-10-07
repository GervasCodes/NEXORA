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
 * AES-256-GCM, key derived from JWT_SECRET via SHA-256 rather than a
 * brand new required env var - JWT_SECRET is already a mandatory,
 * already-rotated-with-care secret (see config/envCheck.js), so this
 * piggybacks on it instead of adding another required secret for this
 * phase. (A dedicated PHONE_ENCRYPTION_KEY would let this be rotated
 * independently of session invalidation - worth doing if/when that
 * becomes a real operational need; flagged, not built, here.)
 */

const crypto = require("crypto");

const getKey = () => crypto.createHash("sha256").update(String(process.env.JWT_SECRET || "")).digest();

exports.encryptPhone = (phone) => {
    if (!phone) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(phone), "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // iv.authTag.ciphertext, each base64 - self-contained, no separate
    // column needed for the IV/tag.
    return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
};

exports.decryptPhone = (payload) => {
    if (!payload) return null;
    try {
        const [ivB64, tagB64, dataB64] = payload.split(".");
        const iv = Buffer.from(ivB64, "base64");
        const authTag = Buffer.from(tagB64, "base64");
        const data = Buffer.from(dataB64, "base64");
        const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
        return null;
    }
};
