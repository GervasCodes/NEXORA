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
