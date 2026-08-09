const { body } = require("express-validator");
const { normalizePhone, DEFAULT_COUNTRY } = require("../utils/phoneNumber");

// Shared phone validator - every module that collects a phone number
// (auth registration, profile updates, seller business/mobile-money
// phone, checkout shipping/mobile-money phone, subscription mobile
// money) uses this instead of its own ad-hoc `.isLength(...)` check, so
// they all agree on what a valid number looks like and all end up
// storing the same E.164 shape.
//
// Reads the country from `<fieldName>_country` if present (falls back
// to `phone_country`, then DEFAULT_COUNTRY) so existing clients that
// haven't added a country selector yet keep working unchanged against
// Tanzania numbers - this is additive, not a breaking API change.
//
// On success, mutates req.body[fieldName] in place to the normalized
// E.164 value, so every controller/service downstream always receives
// the already-normalized number without needing to call normalizePhone()
// itself again.
//
// Usage:
//   phoneValidator("phone")                          // required
//   phoneValidator("business_phone", { optional: true })
//   phoneValidator("shipping_phone", { countryField: "shipping_phone_country" })
module.exports = function phoneValidator(fieldName, { optional = false, countryField } = {}) {
    const resolvedCountryField = countryField || `${fieldName}_country`;

    let chain = body(fieldName);
    chain = optional ? chain.optional({ checkFalsy: true }) : chain.notEmpty().withMessage("Phone number is required");

    return chain.custom((value, { req }) => {
        if (optional && !value) return true;

        const countryCode = req.body[resolvedCountryField] || req.body.phone_country || DEFAULT_COUNTRY;
        const normalized = normalizePhone(value, countryCode);

        if (!normalized) {
            throw new Error("Invalid phone number for the selected country");
        }

        req.body[fieldName] = normalized;
        return true;
    });
};
