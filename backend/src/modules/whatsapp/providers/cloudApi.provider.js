/**
 * Meta WhatsApp Cloud API adapter.
 *
 * Sends a plain text message to a phone number via a configured phone
 * number ID. Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Auth: a permanent access token (WHATSAPP_ACCESS_TOKEN) sent as a
 * bearer header, same shape as most Graph API calls.
 */

const API_VERSION = "v19.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

exports.isConfigured = () => Boolean(PHONE_NUMBER_ID && ACCESS_TOKEN);

// `to` must be in international format with no leading "+" (Cloud API
// convention) - callers pass through whatever format they have; this
// adapter strips a leading "+" so callers don't each need to remember to.
// Sends an approved template message. Used for OTP over WhatsApp, which
// can only be delivered as a template outside the 24-hour session window.
// urlSuffix (optional) fills a dynamic URL button; the template's URL must be
// defined as https://<site>/{{1}} in WhatsApp Manager.
exports.sendTemplate = async (to, { name, language, bodyParams, urlSuffix }) => {
    const response = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ACCESS_TOKEN}`
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to: String(to).replace(/^\+/, ""),
            type: "template",
            template: {
                name,
                language: { code: language },
                components: [
                    {
                        type: "body",
                        parameters: bodyParams.map((text) => ({ type: "text", text: String(text) }))
                    },
                    ...(urlSuffix ? [{
                        type: "button",
                        sub_type: "url",
                        index: "0",
                        parameters: [{ type: "text", text: String(urlSuffix) }]
                    }] : [])
                ]
            }
        })
    });

    if (!response.ok) {
        return { success: false };
    }

    const data = await response.json();
    return { success: true, messageId: data.messages?.[0]?.id || null };
};

exports.sendText = async (to, body) => {
    const response = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ACCESS_TOKEN}`
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to: String(to).replace(/^\+/, ""),
            type: "text",
            text: { body }
        })
    });

    if (!response.ok) {
        return { success: false };
    }

    const data = await response.json();
    return { success: true, messageId: data.messages?.[0]?.id || null };
};
