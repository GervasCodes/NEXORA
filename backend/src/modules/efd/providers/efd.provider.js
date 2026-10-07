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

// Credit note / void (Phase 5, P1) - issued against an already-fiscal-
// receipted order when it's refunded/returned/cancelled, so the order's
// tax record reflects the reversal rather than TRA only ever seeing the
// original sale.
exports.submitCreditNote = async (payload) => resolveProvider().submitCreditNote(payload);
