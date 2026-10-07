#!/usr/bin/env node
/**
 * Payment gateway readiness check.
 *
 *   node scripts/check-payment-providers.js          # config check only (no network)
 *   node scripts/check-payment-providers.js --live   # also tries each gateway's
 *                                                    # login/token call
 *
 * What it does:
 *   - Reads backend/.env (or the environment you run it in) and, for every
 *     payment rail, shows which required variables are present or missing.
 *     Values are never printed.
 *   - Shows which rails the checkout would actually list right now (the
 *     same registry check GET /payment/methods uses).
 *   - With --live: asks PayPal and AzamPay for an access token. That only
 *     proves the credentials and base URL are accepted - it never creates
 *     an order or charges anyone. The other gateways expose no
 *     non-charging probe that this repo documents, so they are reported as
 *     "test with a sandbox payment" instead of guessing at an endpoint.
 *
 * Exit code: 0 normally; 1 if a --live check was run and failed.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const registry = require("../src/modules/payment/providers/registry");

const live = process.argv.includes("--live");
const has = (name) => Boolean(process.env[name]);
const mark = (ok) => (ok ? "OK     " : "MISSING");

const active = (process.env.MOBILE_MONEY_PROVIDER || "").toLowerCase();

const MOBILE_REQUIRED = {
    malipopay: ["MOBILE_MONEY_API_BASE_URL", "MOBILE_MONEY_API_KEY"],
    selcom: ["MOBILE_MONEY_API_BASE_URL", "MOBILE_MONEY_API_KEY", "MOBILE_MONEY_API_SECRET", "MOBILE_MONEY_VENDOR_ID", "SELCOM_WEBHOOK_SECRET"],
    azampay: ["AZAMPAY_API_BASE_URL", "AZAMPAY_APP_NAME", "AZAMPAY_CLIENT_ID", "AZAMPAY_CLIENT_SECRET"]
};

const RAILS = [
    { name: "Mobile Money (active: " + (active || "none set") + ")", required: MOBILE_REQUIRED[active] || ["MOBILE_MONEY_PROVIDER (malipopay | selcom | azampay)"], note: "Switch rail by changing MOBILE_MONEY_PROVIDER." },
    { name: "MalipoPay Card", required: ["MALIPOPAY_CARD_SECRET_KEY", "MALIPOPAY_CARD_WEBHOOK_SECRET"], note: "Optional MALIPOPAY_CARD_API_BASE_URL / MALIPOPAY_CARD_ENVIRONMENT=uat for the test environment." },
    { name: "Snippe", required: ["PAYMENT_ENABLE_SNIPPE=true", "SNIPPE_SECRET_KEY", "SNIPPE_WEBHOOK_SECRET"], note: "Off unless PAYMENT_ENABLE_SNIPPE=true." },
    { name: "PayPal", required: ["PAYMENT_ENABLE_PAYPAL=true", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"], note: "Off unless PAYMENT_ENABLE_PAYPAL=true. PAYPAL_MODE=sandbox|live." }
];

const isSet = (req) => {
    const [name, expected] = req.split("=");
    if (expected !== undefined) return process.env[name] === expected;
    return has(name.split(" ")[0]);
};

console.log(`\nNODE_ENV=${process.env.NODE_ENV || "(unset)"}  (outside production, mobile money falls back to a fake "simulate" provider)\n`);

for (const rail of RAILS) {
    console.log(rail.name);
    for (const req of rail.required) console.log(`   ${mark(isSet(req))} ${req}`);
    console.log(`   - ${rail.note}\n`);
}

console.log("Rails checkout would list right now:");
for (const p of registry.listProviders()) {
    console.log(`   ${p.configured ? "LISTED " : "hidden "} ${p.key}${p.primary ? "  (primary)" : ""}`);
}

const probes = {
    async paypal() {
        if (!(has("PAYPAL_CLIENT_ID") && has("PAYPAL_CLIENT_SECRET"))) return { skipped: "not configured" };
        const base = (process.env.PAYPAL_MODE || "sandbox").toLowerCase() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
        const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
        const res = await fetch(`${base}/v1/oauth2/token`, {
            method: "POST",
            headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: "grant_type=client_credentials"
        });
        return res.ok ? { ok: true, detail: `token issued (${process.env.PAYPAL_MODE || "sandbox"})` } : { ok: false, detail: `HTTP ${res.status}` };
    },
    async azampay() {
        const need = ["AZAMPAY_API_BASE_URL", "AZAMPAY_APP_NAME", "AZAMPAY_CLIENT_ID", "AZAMPAY_CLIENT_SECRET"];
        if (!need.every(has)) return { skipped: "not configured" };
        const res = await fetch(`${process.env.AZAMPAY_API_BASE_URL}/AppRegistration/GenerateToken`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appName: process.env.AZAMPAY_APP_NAME, clientId: process.env.AZAMPAY_CLIENT_ID, clientSecret: process.env.AZAMPAY_CLIENT_SECRET })
        });
        return res.ok ? { ok: true, detail: "token issued" } : { ok: false, detail: `HTTP ${res.status}` };
    }
};

(async () => {
    if (!live) {
        console.log("\nRun with --live to also test PayPal and AzamPay logins (no money moves).\n");
        return;
    }
    console.log("\nLive login checks (no charges):");
    let failed = false;
    for (const [name, probe] of Object.entries(probes)) {
        try {
            const r = await probe();
            if (r.skipped) console.log(`   skipped ${name}: ${r.skipped}`);
            else { console.log(`   ${r.ok ? "PASS   " : "FAIL   "} ${name}: ${r.detail}`); if (!r.ok) failed = true; }
        } catch (e) {
            console.log(`   FAIL    ${name}: ${e.message}`);
            failed = true;
        }
    }
    console.log("   note   mobile money (MalipoPay/Selcom), MalipoPay Card and Snippe: no safe login-only probe - test with a sandbox payment.\n");
    process.exit(failed ? 1 : 0);
})();
