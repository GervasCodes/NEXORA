/**
 * SMS provider ROUTER - mirrors whatsapp/providers/whatsapp.provider.js's
 * shape exactly (see that file's header comment for the full rationale).
 * Every other file talks to this router, never to gateway.provider.js
 * directly.
 */

const gatewayProvider = require("./gateway.provider");
const simulateProvider = require("./simulate.provider");

const resolveProvider = () => {
    if (gatewayProvider.isConfigured()) {
        return gatewayProvider;
    }

    if (process.env.NODE_ENV === "production") {
        throw new Error("SMS gateway is not configured");
    }

    return simulateProvider;
};

exports.sendText = async (to, body) => resolveProvider().sendText(to, body);

exports.isConfigured = () => gatewayProvider.isConfigured();
