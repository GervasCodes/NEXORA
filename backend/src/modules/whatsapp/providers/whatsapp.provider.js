/**
 * WhatsApp provider ROUTER - mirrors payment/providers/mobileMoney.provider.js's
 * shape exactly (see that file's header comment for the full rationale).
 * Every other file talks to this router, never to cloudApi.provider.js
 * directly.
 */

const cloudApiProvider = require("./cloudApi.provider");
const simulateProvider = require("./simulate.provider");

const resolveProvider = () => {
    if (cloudApiProvider.isConfigured()) {
        return cloudApiProvider;
    }

    if (process.env.NODE_ENV === "production") {
        throw new Error("WhatsApp is not configured");
    }

    return simulateProvider;
};

exports.sendText = async (to, body) => resolveProvider().sendText(to, body);

exports.isConfigured = () => cloudApiProvider.isConfigured();

// Template name and language come from env (WHATSAPP_OTP_TEMPLATE_NAME,
// WHATSAPP_OTP_TEMPLATE_LANG). The OTP channel is only offered when the
// template name is set, see otp.service.js channelConfigured.
// Order-status message as an approved template with a tracking-link button.
// Body variables: {{1}} title, {{2}} message. Used only when
// WHATSAPP_ORDER_TEMPLATE_NAME is set; otherwise notify() sends plain text.
exports.orderTemplateConfigured = () =>
    cloudApiProvider.isConfigured() && Boolean(process.env.WHATSAPP_ORDER_TEMPLATE_NAME);

exports.sendOrderTemplate = async (to, { title, message, urlSuffix }) => {
    if (!exports.orderTemplateConfigured()) {
        throw new Error("WhatsApp order template is not configured");
    }

    return cloudApiProvider.sendTemplate(to, {
        name: process.env.WHATSAPP_ORDER_TEMPLATE_NAME,
        language: process.env.WHATSAPP_ORDER_TEMPLATE_LANG || "en",
        bodyParams: [title, message],
        urlSuffix
    });
};

exports.sendOtpTemplate = async (to, code) => {
    if (!cloudApiProvider.isConfigured()) {
        throw new Error("WhatsApp is not configured");
    }

    return cloudApiProvider.sendTemplate(to, {
        name: process.env.WHATSAPP_OTP_TEMPLATE_NAME,
        language: process.env.WHATSAPP_OTP_TEMPLATE_LANG || "en",
        bodyParams: [code]
    });
};
