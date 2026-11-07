/**
 * PawaPay provider adapter (Merchant API v2) - mobile money.
 *
 * PawaPay moves money between NEXORA's PawaPay wallet and the customer's
 * mobile-money wallet (Vodacom M-Pesa, Airtel Money, Mixx by Yas / Tigo Pesa,
 * Halopesa in Tanzania):
 *   - initiate()  -> POST /v2/deposits   (USSD push to the buyer's phone)
 *   - refund()    -> POST /v2/refunds    (against the original deposit), or a
 *                    payout back to the buyer's phone when the original
 *                    deposit id is not known
 *   - disburse()  -> POST /v2/payouts    (seller withdrawals)
 *   - checkStatus -> GET  /v2/deposits/{depositId}
 *
 * PawaPay does NOT offer card acceptance, so this adapter is mobile-money
 * only and is deliberately not registered with the card router
 * (card.provider.js). Use AzamPay or Selcom for cards.
 *
 *   PAWAPAY_API_TOKEN               API token from the PawaPay dashboard (Bearer)
 *   PAWAPAY_MODE                    "sandbox" (default) or "live"
 *   PAWAPAY_API_BASE_URL            optional override of the base URL
 *   PAWAPAY_ALLOW_UNSIGNED_CALLBACKS "true" if signed callbacks are NOT enabled
 *                                   in the dashboard. Callbacks are then never
 *                                   trusted on their own: every one is
 *                                   re-checked against GET /v2/deposits/{id}.
 *   PAWAPAY_CALLBACK_AUTHORITY      optional: the host PawaPay calls (needed to
 *                                   rebuild the signature base if a proxy
 *                                   rewrites the Host header)
 *
 * Deposit ids must be UUIDs, while our payment references look like
 * ORDER-42-9F3A61C0D2B7. The deposit id is derived deterministically from the
 * reference (see depositIdFor), stored as the payment's transaction_reference,
 * and used to find the payment again when PawaPay calls back.
 *
 * Verified against docs.pawapay.io/v2 (deposits, payouts, signatures); as with
 * every adapter in this folder, run a sandbox payment before going live.
 */

const crypto = require("crypto");
const { detectNetwork, toMsisdn } = require("../../../utils/tzMobileNetwork");
const { classifyStatus } = require("../providerStatus");
const logger = require("../../../utils/logger");

const baseUrl = () =>
    (process.env.PAWAPAY_API_BASE_URL ||
        (String(process.env.PAWAPAY_MODE || "sandbox").toLowerCase() === "live"
            ? "https://api.pawapay.io"
            : "https://api.sandbox.pawapay.io")
    ).replace(/\/$/, "");

const token = () => process.env.PAWAPAY_API_TOKEN;

exports.isConfigured = () => Boolean(token());

// Deterministic UUID (version-4 shaped) from a namespace + our reference, so a
// retried request for the same payment attempt reuses the same id - PawaPay
// treats a repeated depositId as DUPLICATE_IGNORED, never a second charge.
const uuidFor = (namespace, reference) => {
    const hex = crypto.createHash("sha256").update(`${namespace}:${reference}`).digest("hex");
    const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        `4${hex.slice(13, 16)}`,
        `${variant}${hex.slice(18, 20)}`,
        hex.slice(20, 32)
    ].join("-");
};

exports.depositIdFor = (reference) => uuidFor("deposit", reference);
exports.isDepositId = (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));

const request = async (method, path, body) => {
    const response = await fetch(`${baseUrl()}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token()}`,
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });

    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
};

// TZS has no minor unit - PawaPay wants a plain string like "15000".
const formatAmount = (amount) => String(Math.round(Number(amount)));

// Customer-facing message: 4-22 alphanumeric characters and spaces.
const customerMessage = (text) => {
    const cleaned = String(text || "NEXORA payment").replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    return (cleaned.length >= 4 ? cleaned : "NEXORA payment").slice(0, 22).trim();
};

// Which PawaPay provider code the phone belongs to. Asks PawaPay's own
// predict-provider endpoint first (it knows about number portability) and
// falls back to the number prefix.
const resolveProviderCode = async (msisdn, override) => {
    if (override) return override;

    try {
        const { ok, data } = await request("POST", "/v2/predict-provider", { phoneNumber: msisdn });
        if (ok && data && data.provider) return data.provider;
    } catch (error) {
        logger.warn({ err: error }, "pawapay predict-provider failed - falling back to number prefix");
    }

    const network = detectNetwork(msisdn);
    return network ? network.pawapay : null;
};

const failure = () => ({ success: false, transactionReference: null });

exports.initiate = async (phone, amount, meta = {}) => {
    const msisdn = toMsisdn(phone);
    if (!msisdn) throw new Error("Enter a valid Tanzanian mobile money number");

    const provider = await resolveProviderCode(msisdn, meta.mno);
    if (!provider) throw new Error("Could not work out the mobile money network for this number");

    const reference = meta.reference || `NEXORA-${Date.now()}`;
    const depositId = exports.depositIdFor(reference);

    const { ok, data } = await request("POST", "/v2/deposits", {
        depositId,
        payer: { type: "MMO", accountDetails: { phoneNumber: msisdn, provider } },
        amount: formatAmount(amount),
        currency: "TZS",
        customerMessage: customerMessage(meta.description),
        metadata: [{ reference }]
    });

    if (!ok || !data) {
        logger.warn({ status: data && data.status, reference }, "pawapay deposit request failed");
        return failure();
    }

    // ACCEPTED = a callback will follow; DUPLICATE_IGNORED = this exact
    // attempt was already accepted earlier, so it is still in flight.
    const accepted = data.status === "ACCEPTED" || data.status === "DUPLICATE_IGNORED";

    if (!accepted) {
        logger.warn({ reference, failureReason: data.failureReason }, "pawapay deposit rejected");
    }

    return { success: accepted, transactionReference: accepted ? depositId : null };
};

// Looks a deposit up directly. depositRef may be our payment reference or an
// already-derived deposit id.
exports.getDeposit = async (depositRef) => {
    const depositId = exports.isDepositId(depositRef) ? depositRef : exports.depositIdFor(depositRef);
    const { ok, data } = await request("GET", `/v2/deposits/${encodeURIComponent(depositId)}`);

    if (!ok || !data) {
        throw new Error(`PawaPay deposit lookup failed${data && data.status ? ` (${data.status})` : ""}`);
    }

    return { depositId, found: data.status === "FOUND", deposit: data.data || null };
};

// Stale-sweep / reconciliation lookup (see mobileMoney.provider.js#checkStatus).
// NOT_FOUND is reported as "unknown", never "failed": a deposit PawaPay
// ACCEPTED always exists, so NOT_FOUND means we never got that far - the
// sweep's age cutoff settles it.
exports.checkStatus = async (reference) => {
    const { depositId, found, deposit } = await exports.getDeposit(reference);

    if (!found || !deposit) return { state: "unknown", transactionReference: depositId };

    return {
        state: classifyStatus(deposit.status),
        providerStatus: deposit.status,
        transactionReference: depositId,
        amount: deposit.amount === undefined ? null : Number(deposit.amount),
        currency: deposit.currency || null
    };
};

// Refund. With the original deposit's id this is a true PawaPay refund
// against that deposit; without it, money goes back to the buyer's phone as a
// payout (same fallback the other mobile-money adapters use).
exports.refund = async (phone, amount, meta = {}) => {
    const originalDepositId = meta.depositId && exports.isDepositId(meta.depositId) ? meta.depositId : null;

    if (originalDepositId) {
        const refundId = uuidFor("refund", meta.reference || `${originalDepositId}:${amount}`);
        const { ok, data } = await request("POST", "/v2/refunds", {
            refundId,
            depositId: originalDepositId,
            amount: formatAmount(amount),
            currency: "TZS"
        });

        const accepted = Boolean(ok && data && (data.status === "ACCEPTED" || data.status === "DUPLICATE_IGNORED"));
        return { success: accepted, transactionReference: accepted ? refundId : null };
    }

    return exports.disburse(phone, amount, { ...meta, reference: meta.reference || `REFUND-${Date.now()}` });
};

// Seller withdrawal / payout leg.
exports.disburse = async (phone, amount, meta = {}) => {
    const msisdn = toMsisdn(phone);
    if (!msisdn) throw new Error("Enter a valid Tanzanian mobile money number");

    const provider = await resolveProviderCode(msisdn, meta.mno);
    if (!provider) throw new Error("Could not work out the mobile money network for this number");

    const payoutId = uuidFor("payout", meta.reference || `${msisdn}:${amount}:${Date.now()}`);

    const { ok, data } = await request("POST", "/v2/payouts", {
        payoutId,
        recipient: { type: "MMO", accountDetails: { phoneNumber: msisdn, provider } },
        amount: formatAmount(amount),
        currency: "TZS",
        customerMessage: customerMessage(meta.description || "NEXORA payout"),
        metadata: [{ reference: meta.reference || payoutId }]
    });

    const accepted = Boolean(ok && data && (data.status === "ACCEPTED" || data.status === "DUPLICATE_IGNORED"));
    return { success: accepted, transactionReference: accepted ? payoutId : null };
};

// ---- Callback verification (RFC 9421 HTTP message signatures) -------------

const KEY_CACHE_MS = 60 * 60 * 1000;
let keyCache = { fetchedAt: 0, keys: [] };

const fetchPublicKeys = async (force = false) => {
    if (!force && keyCache.keys.length && Date.now() - keyCache.fetchedAt < KEY_CACHE_MS) {
        return keyCache.keys;
    }

    const { ok, data } = await request("GET", "/v2/public-key/http");
    if (!ok || !Array.isArray(data)) throw new Error("PawaPay public keys could not be fetched");

    keyCache = { fetchedAt: Date.now(), keys: data };
    return keyCache.keys;
};

exports._resetKeyCache = () => {
    keyCache = { fetchedAt: 0, keys: [] };
};

// Parses `sig-pp=("@method" "content-digest");alg="...";keyid="...";created=1;expires=2`.
const parseSignatureInput = (headerValue) => {
    const match = /^([A-Za-z0-9_-]+)=\(([^)]*)\)(.*)$/.exec(String(headerValue || "").trim());
    if (!match) return null;

    const [, label, componentList, rawParams] = match;
    const components = (componentList.match(/"[^"]+"/g) || []).map((item) => item.slice(1, -1));
    const params = {};
    for (const part of rawParams.split(";").filter(Boolean)) {
        const [key, ...rest] = part.split("=");
        params[key.trim()] = rest.join("=").replace(/^"|"$/g, "");
    }

    return { label, components, params, paramsString: `(${componentList})${rawParams}` };
};

const parseSignatureValue = (headerValue, label) => {
    const match = new RegExp(`${label}=:([^:]+):`).exec(String(headerValue || ""));
    return match ? Buffer.from(match[1], "base64") : null;
};

const verifyWithAlgorithm = (alg, base, signature, publicKeyPem) => {
    const data = Buffer.from(base, "utf8");

    switch (alg) {
        case "ecdsa-p256-sha256":
            return crypto.verify("sha256", data, { key: publicKeyPem, dsaEncoding: "ieee-p1363" }, signature);
        case "ecdsa-p384-sha384":
            return crypto.verify("sha384", data, { key: publicKeyPem, dsaEncoding: "ieee-p1363" }, signature);
        case "rsa-v1_5-sha256":
            return crypto.verify("sha256", data, publicKeyPem, signature);
        case "rsa-pss-sha512":
            return crypto.verify(
                "sha512",
                data,
                { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 64 },
                signature
            );
        default:
            return false;
    }
};

const componentValue = (name, { method, authority, path, headers }) => {
    if (name === "@method") return String(method).toUpperCase();
    if (name === "@authority") return authority;
    if (name === "@path") return path;
    return headers[name] === undefined ? null : String(headers[name]).trim();
};

// Verifies a signed PawaPay callback. `rawBody` is the exact bytes received.
// Returns true/false; never throws for a bad signature.
exports.verifyCallbackSignature = async ({ rawBody, headers, method = "POST", authority, path, now = Date.now() }) => {
    const signatureInput = parseSignatureInput(headers["signature-input"]);
    if (!signatureInput || !headers.signature || !headers["content-digest"]) return false;

    const { label, components, params, paramsString } = signatureInput;

    // 1. Body integrity: Content-Digest must match the bytes we received.
    const digestMatch = /^(sha-256|sha-512)=:([^:]+):/.exec(String(headers["content-digest"]).trim());
    if (!digestMatch) return false;
    const digest = crypto
        .createHash(digestMatch[1] === "sha-512" ? "sha512" : "sha256")
        .update(rawBody)
        .digest("base64");
    if (digest !== digestMatch[2]) return false;

    // 2. Freshness.
    const nowSeconds = Math.floor(now / 1000);
    if (params.expires && Number(params.expires) < nowSeconds) return false;
    if (params.created && Number(params.created) > nowSeconds + 300) return false;

    // 3. Rebuild the signature base exactly as listed in Signature-Input.
    const context = { method, authority, path, headers };
    const lines = [];
    for (const name of components) {
        const value = componentValue(name, context);
        if (value === null) return false;
        lines.push(`"${name}": ${value}`);
    }
    lines.push(`"@signature-params": ${paramsString}`);
    const base = lines.join("\n");

    const signature = parseSignatureValue(headers.signature, label);
    if (!signature) return false;

    // 4. Check against PawaPay's published key for this keyid (refetching
    //    once in case the key was rotated since we cached the list).
    for (const force of [false, true]) {
        const keys = await fetchPublicKeys(force);
        const key = keys.find((item) => item.id === params.keyid);
        if (!key) continue;

        try {
            return verifyWithAlgorithm(params.alg, base, signature, key.key);
        } catch (error) {
            logger.warn({ err: error }, "pawapay callback signature check errored");
            return false;
        }
    }

    return false;
};

// Opt-in for accounts that have not enabled signed callbacks in the PawaPay
// dashboard. The controller then re-checks every callback against the API
// (getDeposit) instead of trusting the body.
exports.allowUnsignedCallbacks = () => process.env.PAWAPAY_ALLOW_UNSIGNED_CALLBACKS === "true";
