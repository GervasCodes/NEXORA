/**
 * EFD provider ROUTER - mirrors payment/providers/mobileMoney.provider.js
 * and whatsapp/providers/whatsapp.provider.js's shape exactly. Every
 * other file talks to this router, never to traVfd.provider.js directly.
 */

const traVfdProvider = require("./traVfd.provider");
const simulateProvider = require("./simulate.provider");

const resolveProvider = () => {
    if (traVfdProvider.isConfigured()) {
        return traVfdProvider;
    }

    if (process.env.NODE_ENV === "production") {
        throw new Error("TRA VFD is not configured");
    }

    return simulateProvider;
};

exports.submitInvoice = async (payload) => resolveProvider().submitInvoice(payload);
