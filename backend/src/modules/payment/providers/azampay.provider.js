/**
 * AzamPay provider adapter - mobile money (USSD push) AND hosted checkout
 * (card / bank / mobile money on AzamPay's payment page).
 *
 * AzamPay authenticates with a short-lived bearer token fetched from a
 * separate authenticator host (not a static header, not a per-request
 * signature). Nothing outside this file ever sees the token.
 *
 *   AZAMPAY_API_BASE_URL     checkout API host
 *                            sandbox: https://sandbox.azampay.co.tz
 *                            live:    https://checkout.azampay.co.tz
 *   AZAMPAY_AUTH_BASE_URL    authenticator host (defaults to AZAMPAY_API_BASE_URL)
 *                            sandbox: https://authenticator-sandbox.azampay.co.tz
 *                            live:    https://authenticator.azampay.co.tz
 *   AZAMPAY_APP_NAME         "App Name" from the AzamPay dashboard
 *   AZAMPAY_CLIENT_ID        client id (used to fetch a token)
 *   AZAMPAY_CLIENT_SECRET    client secret (used to fetch a token)
 *   AZAMPAY_API_KEY          optional: sent as X-API-Key when your account has one
 *   AZAMPAY_VENDOR_ID        vendor id (hosted checkout / card only)
 *   AZAMPAY_VENDOR_NAME      vendor display name (hosted checkout, default "NEXORA")
 *   AZAMPAY_WEBHOOK_SECRET   shared secret for the callback (see
 *                            webhookAuth.middleware.js#verifyAzampayWebhook)
 *
 * Flows:
 *   mobile money : POST /azampay/mno/checkout  (USSD push; network detected
 *                  from the phone prefix unless meta.mno is passed)
 *   card         : POST /api/v1/Partner/PostCheckout -> URL of AzamPay's
 *                  hosted payment page; the buyer picks card (or any other
 *                  method enabled on the account) there
 *
 * Endpoint paths and field names follow AzamPay's published API and client
 * SDKs; confirm them in the AzamPay sandbox before going live.
 */

const { detectNetwork } = require("../../../utils/tzMobileNetwork");

const cfg = () => ({
    baseUrl: (process.env.AZAMPAY_API_BASE_URL || "").replace(/\/+$/, ""),
    authUrl: (process.env.AZAMPAY_AUTH_BASE_URL || process.env.AZAMPAY_API_BASE_URL || "").replace(/\/+$/, ""),
    appName: process.env.AZAMPAY_APP_NAME,
    clientId: process.env.AZAMPAY_CLIENT_ID,
    clientSecret: process.env.AZAMPAY_CLIENT_SECRET,
    apiKey: process.env.AZAMPAY_API_KEY,
    vendorId: process.env.AZAMPAY_VENDOR_ID,
    vendorName: process.env.AZAMPAY_VENDOR_NAME || "NEXORA"
});

exports.isConfigured = () => {
    const { baseUrl, appName, clientId, clientSecret } = cfg();
    return Boolean(baseUrl && appName && clientId && clientSecret);
};

// Hosted checkout additionally needs the vendor id from the dashboard.
exports.supportsCheckout = () => exports.isConfigured() && Boolean(cfg().vendorId);

let cachedToken = null;
let cachedTokenExpiresAt = 0;

exports._resetTokenCache = () => {
    cachedToken = null;
    cachedTokenExpiresAt = 0;
};

const getAccessToken = async () => {
    if (cachedToken && Date.now() < cachedTokenExpiresAt) {
        return cachedToken;
    }

    const { authUrl, appName, clientId, clientSecret, apiKey } = cfg();

    const response = await fetch(`${authUrl}/AppRegistration/GenerateToken`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "X-API-Key": apiKey } : {})
        },
        body: JSON.stringify({ appName, clientId, clientSecret })
    });

    if (!response.ok) {
        throw new Error("AzamPay: failed to obtain access token");
    }

    const data = await response.json();
    cachedToken = data.data?.accessToken || data.accessToken;
    if (!cachedToken) {
        throw new Error("AzamPay: token response carried no access token");
    }

    // Refresh a little early rather than risk using a token that expires
    // mid-request. `expire` is an ISO timestamp in AzamPay's response; some
    // responses give seconds instead - handle both.
    const rawExpiry = data.data?.expire ?? data.expiresIn;
    const expiryMs = Number.isFinite(Number(rawExpiry))
        ? Date.now() + Number(rawExpiry) * 1000
        : Date.parse(rawExpiry);
    cachedTokenExpiresAt = (Number.isFinite(expiryMs) ? expiryMs : Date.now() + 3300 * 1000) - 5 * 60 * 1000;

    return cachedToken;
};

const post = async (path, body) => {
    const { baseUrl, apiKey } = cfg();
    const token = await getAccessToken();

    const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(apiKey ? { "X-API-Key": apiKey } : {})
        },
        body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => null);
    return { ok: response.ok, data };
};

const mnoName = (phone, override) => {
    if (override) return override;

    const network = detectNetwork(phone);
    if (!network) throw new Error("Could not work out the mobile money network for this number");
    return network.azampay;
};

const accountNumber = (phone) => String(phone || "").replace(/\D/g, "").replace(/^0/, "255");

const mnoRequest = async (path, kind, phone, amount, meta) => {
    const { ok, data } = await post(path, {
        accountNumber: accountNumber(phone),
        amount: String(Math.round(Number(amount))),
        currency: "TZS",
        externalId: meta.reference || `NEXORA-${kind}-${Date.now()}`,
        provider: mnoName(phone, meta.mno)
    });

    if (!ok || !data) {
        return { success: false, transactionReference: null };
    }

    return {
        success: data.success === true || String(data.status || "").toLowerCase() === "success",
        transactionReference: data.transactionId || data.reference || data.data?.transactionId || null
    };
};

exports.initiate = (phone, amount, meta = {}) => mnoRequest("/azampay/mno/checkout", "", phone, amount, meta);

// Refund leg - AzamPay's commonly documented API has no collection-reversal
// endpoint, so this is a disbursement back to the buyer's own phone.
exports.refund = (phone, amount, meta = {}) => mnoRequest("/azampay/mno/disburse", "REFUND", phone, amount, meta);

// Payout / seller-withdrawal leg - same disbursement endpoint.
exports.disburse = (phone, amount, meta = {}) => mnoRequest("/azampay/mno/disburse", "PAYOUT", phone, amount, meta);

// Hosted checkout: returns the URL of AzamPay's payment page. The
// externalId (our payment reference) comes back in the callback as
// `utilityref`. AzamPay limits externalId to 30 characters; our references
// (e.g. ORDER-42-9F3A61C0D2B7) stay well inside that.
exports.createCheckoutSession = async ({ amountTzs, reference, description, successUrl, cancelUrl }) => {
    if (!exports.supportsCheckout()) {
        throw new Error("AzamPay hosted checkout is not configured (AZAMPAY_VENDOR_ID is missing)");
    }

    const { appName, clientId, vendorId, vendorName } = cfg();

    let requestOrigin;
    try {
        requestOrigin = new URL(successUrl).origin;
    } catch (error) {
        requestOrigin = process.env.FRONTEND_URL || "";
    }

    const { ok, data } = await post("/api/v1/Partner/PostCheckout", {
        appName,
        clientId,
        vendorId,
        vendorName,
        language: "en",
        currency: "TZS",
        externalId: reference,
        requestOrigin,
        redirectSuccessURL: successUrl,
        redirectFailURL: cancelUrl,
        amount: String(Math.round(Number(amountTzs))),
        cart: { items: [{ name: description || "NEXORA payment" }] }
    });

    const url = typeof data?.data === "string" ? data.data : data?.data?.url;

    if (!ok || !data || data.success === false || !url) {
        throw new Error(data?.message || "AzamPay checkout could not be created");
    }

    return { success: true, sessionId: reference, url };
};
