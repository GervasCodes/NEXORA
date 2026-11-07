// Tanzanian mobile-network detection from a phone number prefix.
//
// AzamPay and PawaPay both need the buyer's mobile network named on the
// request (AzamPay: "Mpesa" / "Tigo" / "Airtel" / "Halopesa" / "Azampesa";
// PawaPay: VODACOM_TZA / AIRTEL_TZA / TIGO_TZA / HALOTEL_TZA), while the
// caller only has a phone number. Number portability exists in Tanzania, so
// a prefix is a best guess, not a guarantee - callers can always override
// with an explicit `meta.mno`, and PawaPay's own predict-provider endpoint is
// used first by pawapay.provider.js when it is reachable.

const NETWORKS = {
    vodacom: { azampay: "Mpesa", pawapay: "VODACOM_TZA", prefixes: ["74", "75", "76"] },
    tigo: { azampay: "Tigo", pawapay: "TIGO_TZA", prefixes: ["65", "67", "71", "77"] },
    airtel: { azampay: "Airtel", pawapay: "AIRTEL_TZA", prefixes: ["68", "69", "78"] },
    halotel: { azampay: "Halopesa", pawapay: "HALOTEL_TZA", prefixes: ["61", "62"] }
};

// Returns the national significant number (9 digits) for any common way of
// writing a Tanzanian number, or null when it is not one.
exports.toNationalNumber = (phone) => {
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.startsWith("255") && digits.length === 12) return digits.slice(3);
    if (digits.startsWith("0") && digits.length === 10) return digits.slice(1);
    if (digits.length === 9) return digits;
    return null;
};

// "255712345678" - digits only, country code first, no "+" and no leading
// zero: the shape PawaPay and AzamPay both expect.
exports.toMsisdn = (phone) => {
    const national = exports.toNationalNumber(phone);
    return national ? `255${national}` : null;
};

exports.detectNetwork = (phone) => {
    const national = exports.toNationalNumber(phone);
    if (!national) return null;

    const prefix = national.slice(0, 2);
    const key = Object.keys(NETWORKS).find((name) => NETWORKS[name].prefixes.includes(prefix));
    return key ? { key, ...NETWORKS[key] } : null;
};
