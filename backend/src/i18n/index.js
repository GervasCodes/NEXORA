// Minimal in-process i18n helper - no external dependency needed for
// the two locales NEXORA supports today. Add a new locale by dropping
// a `<code>.js` file in ./locales with the same key structure as
// en.js, then adding its code to SUPPORTED_LOCALES below.
const en = require("./locales/en");
const sw = require("./locales/sw");

const CATALOGS = { en, sw };

const SUPPORTED_LOCALES = Object.keys(CATALOGS);
const DEFAULT_LOCALE = "en";

// Normalizes any incoming value (Accept-Language tag, query param,
// stored user preference, JWT claim) down to a locale we actually
// have a catalog for, defaulting to English for anything unknown.
const resolveLocale = (candidate) => {
    if (!candidate) return DEFAULT_LOCALE;
    const code = String(candidate).toLowerCase().slice(0, 2);
    return SUPPORTED_LOCALES.includes(code) ? code : DEFAULT_LOCALE;
};

// Picks the best supported locale out of a raw `Accept-Language`
// header, e.g. "sw-TZ,sw;q=0.9,en;q=0.8".
const resolveFromAcceptLanguage = (header) => {
    if (!header) return DEFAULT_LOCALE;

    const tags = header
        .split(",")
        .map((part) => part.split(";")[0].trim())
        .filter(Boolean);

    for (const tag of tags) {
        const code = resolveLocale(tag);
        if (SUPPORTED_LOCALES.includes(String(tag).toLowerCase().slice(0, 2))) {
            return code;
        }
    }

    return DEFAULT_LOCALE;
};

const getByPath = (obj, path) => {
    return path.split(".").reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
};

const interpolate = (template, params) => {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, key) => (
        params[key] !== undefined && params[key] !== null ? String(params[key]) : ""
    ));
};

// Looks up `namespace.key` (e.g. "notifications.order.placed.title") in
// the requested locale, falling back to English, then to the raw key
// itself, so a missing/mistyped translation never renders blank.
const t = (locale, key, params) => {
    const resolved = resolveLocale(locale);
    const template = getByPath(CATALOGS[resolved], key) ?? getByPath(CATALOGS[DEFAULT_LOCALE], key) ?? key;
    return interpolate(template, params);
};

module.exports = {
    t,
    resolveLocale,
    resolveFromAcceptLanguage,
    SUPPORTED_LOCALES,
    DEFAULT_LOCALE
};
