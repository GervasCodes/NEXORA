/**
 * PayPal provider - Orders v2 REST API (create + capture), used for the
 * same two purposes as snippe.provider.js: order checkout and the
 * seller verification fee.
 *
 * IMPORTANT: unlike Snippe, PayPal does NOT support TZS as a transaction
 * currency. Every amount here is converted to USD first, using the
 * admin-editable `usd_exchange_rate` platform setting (TZS per 1 USD -
 * see settings.service.js). This is a coarse approximation, not a live
 * FX feed - the USD amount actually charged is stored on the payment
 * record (see payment.repository.js) alongside the original TZS amount,
 * so receipts and reconciliation always show both.
 *
 * Flow (redirect-based, no PayPal SDK dependency - plain REST + fetch):
 *   1. createOrder() -> buyer is redirected to the returned `approveUrl`
 *   2. buyer approves on PayPal's site, PayPal redirects back to our
 *      return_url with ?token=<paypal order id>
 *   3. our frontend calls our own capture endpoint, which calls
 *      captureOrder() here to actually take the funds server-side -
 *      never trust the redirect alone as proof of payment.
 */

const BASE_URLS = {
    sandbox: "https://api-m.sandbox.paypal.com",
    live: "https://api-m.paypal.com"
};

const baseUrl = () => BASE_URLS[(process.env.PAYPAL_MODE || "sandbox").toLowerCase()] || BASE_URLS.sandbox;

exports.isConfigured = () => Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

const getAccessToken = async () => {
    if (!exports.isConfigured()) {
        throw new Error("PayPal is not configured");
    }

    const credentials = Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
    });

    if (!response.ok) {
        throw new Error("Could not authenticate with PayPal");
    }

    const data = await response.json();
    return data.access_token;
};

// amountTzs: decimal TZS amount. usdExchangeRate: TZS per 1 USD (from
// settingsService.getUsdExchangeRate() - passed in rather than read here
// to keep this module free of a dependency on the settings module).
exports.createOrder = async ({ amountTzs, usdExchangeRate, reference, description, returnUrl, cancelUrl }) => {
    const usdAmount = Number((Number(amountTzs) / usdExchangeRate).toFixed(2));

    const accessToken = await getAccessToken();

    const response = await fetch(`${baseUrl()}/v2/checkout/orders`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            intent: "CAPTURE",
            purchase_units: [
                {
                    reference_id: reference,
                    description: description || "NEXORA payment",
                    amount: {
                        currency_code: "USD",
                        value: usdAmount.toFixed(2)
                    }
                }
            ],
            application_context: {
                return_url: returnUrl,
                cancel_url: cancelUrl,
                user_action: "PAY_NOW"
            }
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "PayPal order could not be created");
    }

    const approveLink = (data.links || []).find((link) => link.rel === "approve");

    return {
        success: true,
        paypalOrderId: data.id,
        approveUrl: approveLink?.href,
        usdAmount
    };
};

// Actually takes the funds. Only trust this result, never the frontend
// redirect alone, as proof a PayPal payment succeeded.
exports.captureOrder = async (paypalOrderId) => {
    const accessToken = await getAccessToken();

    const response = await fetch(`${baseUrl()}/v2/checkout/orders/${paypalOrderId}/capture`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    const data = await response.json();

    const completed = response.ok && data.status === "COMPLETED";
    const reference = data.purchase_units?.[0]?.reference_id;
    const captureId = data.purchase_units?.[0]?.payments?.captures?.[0]?.id;

    return {
        success: completed,
        reference,
        transactionReference: captureId || paypalOrderId,
        raw: data
    };
};

// Refund leg (Phase 2 - Refund Automation). Refunds a previously
// captured payment via PayPal's documented Payments v2 API
// (POST /v2/payments/captures/{capture_id}/refund). captureId is the
// value stored as payments.transaction_reference for a PayPal payment
// (see captureOrder() above / payment.service.js). Omitting `amount`
// in the request body means "refund the full captured amount" per
// PayPal's API - pass amountUsd for a partial refund.
exports.refundCapture = async (captureId, amountUsd = null) => {
    const accessToken = await getAccessToken();

    const body = amountUsd
        ? { amount: { currency_code: "USD", value: Number(amountUsd).toFixed(2) } }
        : {};

    const response = await fetch(`${baseUrl()}/v2/payments/captures/${captureId}/refund`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();

    const succeeded = response.ok && (data.status === "COMPLETED" || data.status === "PENDING");

    return {
        success: succeeded,
        refundReference: data.id || null,
        error: succeeded ? null : (data.message || data.details?.[0]?.description || "PayPal refund failed")
    };
};
