const { normalizePhone } = require("./phoneNumber");

// Structured payout destinations (Round 6 Phase 5). Replaces the old
// free-text payout_details + keyword heuristic: the seller now supplies
// network + phone (mobile money) or bank + account number + account name
// (bank transfer), validated here. `details` is the human-readable string
// composed from those fields - it keeps feeding what already read the old
// free-text column (the first-payout hold match, masking, admin lists).
const PAYOUT_METHODS = ["mobile_money", "bank_transfer"];

const PAYOUT_NETWORKS = {
    vodacom_mpesa: "Vodacom M-Pesa",
    tigo_pesa: "Mixx by Yas (Tigo Pesa)",
    airtel_money: "Airtel Money",
    halopesa: "HaloPesa"
};

const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const fail = (message) => {
    const error = new Error(message);
    error.status = 400;
    return error;
};

// input: { payout_method, payout_network, payout_phone, payout_bank_name,
//          payout_account_number, payout_account_name } (API field names)
// returns: { method, details, fields } or throws a 400 Error.
const buildPayout = (input = {}) => {
    const method = input.payout_method;

    if (method === "mobile_money") {
        const network = input.payout_network;
        if (!PAYOUT_NETWORKS[network]) {
            throw fail("Select your mobile money network");
        }
        const phone = normalizePhone(input.payout_phone, input.payout_phone_country || "TZ");
        if (!phone) {
            throw fail("Enter a valid mobile money phone number");
        }
        return {
            method,
            details: `${PAYOUT_NETWORKS[network]} ${phone}`,
            fields: { network, phone, bankName: null, accountNumber: null, accountName: null }
        };
    }

    if (method === "bank_transfer") {
        const bankName = clean(input.payout_bank_name, 80);
        const accountNumber = String(input.payout_account_number ?? "").replace(/[\s-]/g, "");
        const accountName = clean(input.payout_account_name, 120);

        if (bankName.length < 2) throw fail("Enter the bank name");
        if (!/^[0-9A-Za-z]{6,30}$/.test(accountNumber)) throw fail("Enter a valid bank account number");
        if (accountName.length < 3 || !/[A-Za-z]/.test(accountName)) throw fail("Enter the account holder name");

        return {
            method,
            details: `${bankName} · ${accountNumber} · ${accountName}`,
            fields: { network: null, phone: null, bankName, accountNumber, accountName }
        };
    }

    throw fail("Select a payout method");
};

module.exports = { PAYOUT_METHODS, PAYOUT_NETWORKS, buildPayout };
