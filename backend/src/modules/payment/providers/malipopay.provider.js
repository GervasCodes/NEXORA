/**
 * MalipoPay provider adapter.
 *
 * MalipoPay auth is simple: one key ("Secret Key" in their dashboard,
 * called `apiToken`) sent as a header on every request. There is no
 * separate secret and no merchant code — don't wait for those, they
 * don't exist in this provider's model.
 *
 * Docs: https://developers.malipopay.co.tz/
 */

const BASE_URL = process.env.MOBILE_MONEY_API_BASE_URL;
const API_TOKEN = process.env.MOBILE_MONEY_API_KEY;

exports.isConfigured = () => Boolean(BASE_URL && API_TOKEN);

exports.initiate = async (phone, amount, meta = {}) => {
    const response = await fetch(`${BASE_URL}/payment/collection`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apiToken: API_TOKEN
        },
        body: JSON.stringify({
            reference: meta.reference || `NEXORA-${Date.now()}`,
            description: meta.description || "NEXORA order payment",
            amount,
            phoneNumber: phone,
            amountType: "FULL"
        })
    });

    if (!response.ok) {
        return { success: false, transactionReference: null };
    }

    const data = await response.json();

    // MalipoPay's collection response shape — confirm exact field names
    // against your dashboard's API reference/sandbox response before going
    // live; this covers the most commonly documented shape.
    return {
        success: Boolean(data.success ?? data.status === "success" ?? data.status === "SUCCESS"),
        transactionReference: data.reference || data.transactionReference || data.data?.reference || null
    };
};

// Refund leg — MalipoPay has no dedicated "reverse this collection"
// endpoint in the commonly documented API, so a refund here is a payout
// (disbursement) back to the buyer's own phone number for the refunded
// amount. Functionally correct for mobile money (the buyer gets their
// money back on the same wallet), but confirm against your dashboard
// whether a true collection-reversal endpoint exists before relying on
// this path for large volumes — a reversal (if available) would avoid
// float/settlement timing issues that a fresh disbursement can have.
exports.refund = async (phone, amount, meta = {}) => {
    const response = await fetch(`${BASE_URL}/payout/disbursement`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apiToken: API_TOKEN
        },
        body: JSON.stringify({
            reference: meta.reference || `NEXORA-REFUND-${Date.now()}`,
            description: meta.description || "NEXORA dispute refund",
            amount,
            phoneNumber: phone
        })
    });

    if (!response.ok) {
        return { success: false, transactionReference: null };
    }

    const data = await response.json();

    return {
        success: Boolean(data.success ?? data.status === "success" ?? data.status === "SUCCESS"),
        transactionReference: data.reference || data.transactionReference || data.data?.reference || null
    };
};

// Payout / seller-withdrawal leg — used when an admin approves a wallet
// withdrawal (see wallet.service.js processWithdrawal) instead of paying
// the seller manually outside the app.
exports.disburse = async (phone, amount, meta = {}) => {
    const response = await fetch(`${BASE_URL}/payout/disbursement`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apiToken: API_TOKEN
        },
        body: JSON.stringify({
            reference: meta.reference || `NEXORA-PAYOUT-${Date.now()}`,
            description: meta.description || "NEXORA seller payout",
            amount,
            phoneNumber: phone
        })
    });

    if (!response.ok) {
        return { success: false, transactionReference: null };
    }

    const data = await response.json();

    return {
        success: Boolean(data.success ?? data.status === "success" ?? data.status === "SUCCESS"),
        transactionReference: data.reference || data.transactionReference || data.data?.reference || null
    };
};
