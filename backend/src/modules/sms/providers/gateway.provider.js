/**
 * SMS gateway adapter - Beem Africa (apisms.beem.africa), the most
 * commonly used SMS API for Tanzania-focused apps and the natural fit
 * given every other provider already wired up in this codebase
 * (MalipoPay, AzamPay, Selcom) is TZ-specific too.
 *
 * Auth: HTTP Basic, api_key as the username and secret_key as the
 * password (Beem's documented shape - see developers.beem.africa).
 * Docs: https://docs.beem.africa/docs/sms/quickstart
 */

const BASE_URL = process.env.SMS_GATEWAY_BASE_URL || "https://apisms.beem.africa/v1/send";
const API_KEY = process.env.SMS_GATEWAY_API_KEY;
const SECRET_KEY = process.env.SMS_GATEWAY_SECRET_KEY;
const SENDER_ID = process.env.SMS_GATEWAY_SENDER_ID || "NEXORA";

exports.isConfigured = () => Boolean(API_KEY && SECRET_KEY);

// `to` accepted in whatever format the caller has (with or without a
// leading "+") - Beem expects a bare international-format number, so
// this strips a leading "+" the same way cloudApi.provider.js does for
// WhatsApp.
exports.sendText = async (to, body) => {
    const auth = Buffer.from(`${API_KEY}:${SECRET_KEY}`).toString("base64");

    const response = await fetch(BASE_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${auth}`
        },
        body: JSON.stringify({
            source_addr: SENDER_ID,
            encoding: 0,
            message: body,
            recipients: [
                { recipient_id: 1, dest_addr: String(to).replace(/^\+/, "") }
            ]
        })
    });

    if (!response.ok) {
        return { success: false };
    }

    const data = await response.json();

    // Beem's documented success shape carries a top-level `successful`
    // boolean and a request_id - confirm against your dashboard/sandbox
    // response before relying on this in production, same caveat every
    // other provider adapter in this codebase carries (see
    // malipopay.provider.js's header comment).
    return {
        success: Boolean(data.successful ?? data.code === 100),
        messageId: data.request_id || null
    };
};
