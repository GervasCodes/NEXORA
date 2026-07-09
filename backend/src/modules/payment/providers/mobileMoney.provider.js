/**
 * Mobile money provider adapter.
 *
 * This is the ONLY place that should know whether we're talking to a real
 * mobile money API or simulating one. payment.service.js just calls
 * `initiate(phone, amount)` and doesn't care which mode it's in.
 *
 * Modes:
 *   - Configured  (MOBILE_MONEY_* env vars all set): calls the real provider.
 *   - Unconfigured + NODE_ENV !== "production": simulates a successful
 *     payment so you can build/test the rest of the checkout flow without
 *     real merchant credentials. Every simulated call logs a loud warning
 *     so it's impossible to miss in the logs.
 *   - Unconfigured + NODE_ENV === "production": throws. This is the whole
 *     point of this file existing — it makes it impossible to accidentally
 *     deploy to production still running in "always succeeds" mode.
 */

const isConfigured = () =>
    Boolean(
        process.env.MOBILE_MONEY_API_BASE_URL &&
        process.env.MOBILE_MONEY_API_KEY &&
        process.env.MOBILE_MONEY_API_SECRET &&
        process.env.MOBILE_MONEY_MERCHANT_CODE
    );

// ---------------------------------------------------------------------------
// Real provider call.
//
// TODO: This request/response shape is a placeholder — every mobile money
// provider (M-Pesa, Tigo Pesa, Airtel Money, or an aggregator like Selcom /
// Flutterwave / DPO) has its own API contract, auth scheme, and callback
// flow. Replace the body of this function with the real integration once
// you've picked a provider and have their API docs + merchant credentials.
// Most of these APIs are asynchronous: this initiates the request, and the
// provider then hits a webhook/callback URL with the real result - if so,
// you'll also need a callback route (see payment.routes.js) that verifies
// the callback signature and calls paymentRepository.markCompleted /
// markFailed from there, rather than trusting the initiate response alone.
// ---------------------------------------------------------------------------
const callRealProvider = async (phone, amount) => {
    const response = await fetch(
        `${process.env.MOBILE_MONEY_API_BASE_URL}/payments`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.MOBILE_MONEY_API_KEY}`
            },
            body: JSON.stringify({
                merchant_code: process.env.MOBILE_MONEY_MERCHANT_CODE,
                phone,
                amount
            })
        }
    );

    if (!response.ok) {
        return { success: false, transactionReference: null };
    }

    const data = await response.json();

    return {
        success: Boolean(data.success),
        transactionReference: data.transaction_reference || null
    };
};

const simulateProvider = (phone, amount) => {
    console.warn(
        "\n" +
        "=============================================================\n" +
        "  SIMULATED MOBILE MONEY PAYMENT — no real charge occurred.\n" +
        `  phone=${phone} amount=${amount}\n` +
        "  Set MOBILE_MONEY_API_BASE_URL / API_KEY / API_SECRET /\n" +
        "  MERCHANT_CODE in .env to use the real provider.\n" +
        "=============================================================\n"
    );

    return {
        success: true,
        transactionReference: `SIMULATED-${Date.now()}`
    };
};

exports.initiate = async (phone, amount) => {
    if (isConfigured()) {
        return callRealProvider(phone, amount);
    }

    if (process.env.NODE_ENV === "production") {
        throw new Error(
            "Mobile money is not configured (missing MOBILE_MONEY_API_BASE_URL / " +
            "API_KEY / API_SECRET / MERCHANT_CODE) and NODE_ENV is 'production' - " +
            "refusing to simulate a payment in production. Set these env vars " +
            "or disable mobile money at checkout until they're set."
        );
    }

    return simulateProvider(phone, amount);
};
