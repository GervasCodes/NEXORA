// Centralized phone number handling — Monetization Control roadmap,
// Section 3 (Mobile Number Country Code System). Every place that used
// to accept a bare "phone" string with its own ad-hoc length check
// (auth registration, profile updates, seller business/mobile-money
// phone, checkout shipping/mobile-money phone, subscription mobile
// money) now normalizes through here instead, so every phone number in
// the database is stored in the same E.164 shape
// (`+<dial code><national number>`, e.g. `+255712345678`) regardless of
// how the seller/buyer typed it in.
//
// East African Community coverage to match NEXORA's "regional
// marketplace" scope, not just Tanzania - add a country here and every
// validator/service that calls normalizePhone()/isValidPhone() below
// picks it up automatically, no other file needs to change.
const SUPPORTED_COUNTRIES = [
    { code: "TZ", name: "Tanzania", dialCode: "255", nsnLength: 9 },
    { code: "KE", name: "Kenya", dialCode: "254", nsnLength: 9 },
    { code: "UG", name: "Uganda", dialCode: "256", nsnLength: 9 },
    { code: "RW", name: "Rwanda", dialCode: "250", nsnLength: 9 },
    { code: "BI", name: "Burundi", dialCode: "257", nsnLength: 8 }
];

const DEFAULT_COUNTRY = "TZ";

exports.SUPPORTED_COUNTRIES = SUPPORTED_COUNTRIES;
exports.DEFAULT_COUNTRY = DEFAULT_COUNTRY;

exports.findCountry = (code) =>
    SUPPORTED_COUNTRIES.find((c) => c.code === String(code || DEFAULT_COUNTRY).toUpperCase());

// East African mobile numbers are dialled locally with a leading trunk
// "0" (e.g. 0712 345 678) that's dropped once a country code is
// prefixed (+255 712 345 678) - this strips any non-digit formatting
// (spaces, dashes, parens) and that leading trunk zero, leaving just
// the national significant number digits.
const stripToNationalDigits = (raw) => String(raw || "").replace(/\D/g, "").replace(/^0+/, "");

// Normalizes a raw phone input + ISO country code into E.164. Two
// cases:
//
//   1. The value already looks internationally-qualified - typed with
//      a leading "+" (what Register.jsx's full ~50-country picker in
//      frontend/src/data/countryCodes.js already assembles and sends,
//      e.g. "+15551234567"), or long enough (>10 digits, not starting
//      with a trunk "0") that it can only be a dial code glued to a
//      national number already. Stored as-is (just E.164 length bounds
//      checked, 8-15 digits per the ITU E.164 spec) rather than
//      re-validating against a specific country's exact national-number
//      length - NEXORA doesn't maintain precise numbering-plan data for
//      every country in that ~50-country picker, only the East African
//      countries below.
//
//   2. Otherwise it's a bare local number (e.g. "0712345678", commonly
//      with no country picker in front of it at all - seller
//      mobile-money phone, verification fee phone) - strip the East
//      African trunk-0 dialing convention and check its exact national
//      significant number length for the given (or default) country.
exports.normalizePhone = (raw, countryCode) => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return null;

    const hadPlus = trimmed.startsWith("+");
    const allDigits = trimmed.replace(/\D/g, "");
    if (!allDigits) return null;

    if (hadPlus || (allDigits.length > 10 && !allDigits.startsWith("0"))) {
        if (allDigits.length < 8 || allDigits.length > 15) return null;
        return `+${allDigits}`;
    }

    const country = exports.findCountry(countryCode);
    if (!country) return null;

    const national = stripToNationalDigits(raw);
    if (national.length !== country.nsnLength) return null;

    return `+${country.dialCode}${national}`;
};

exports.isValidPhone = (raw, countryCode) => exports.normalizePhone(raw, countryCode) !== null;

// For display: splits a stored E.164 number back into its country and
// national-number parts, e.g. for pre-filling a country selector +
// national-number field when editing a saved phone number. Falls back
// to DEFAULT_COUNTRY with the raw digits as the national part if the
// stored value doesn't match a known dial code (shouldn't happen for
// anything normalizePhone() produced, but old pre-migration data might
// not be in E.164 yet).
exports.splitPhone = (e164) => {
    const digits = String(e164 || "").replace(/\D/g, "");
    const country = SUPPORTED_COUNTRIES.find((c) => digits.startsWith(c.dialCode));
    if (country) {
        return { countryCode: country.code, nationalNumber: digits.slice(country.dialCode.length) };
    }
    return { countryCode: DEFAULT_COUNTRY, nationalNumber: digits };
};
