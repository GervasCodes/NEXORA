
// Phase 2 (Remediation, E3): this always renders the raw settlement amount
// in TZS, regardless of the buyer's chosen display currency. It's the right
// choice for seller/admin/finance surfaces where the number needs to match
// what actually settles (wallets, payouts, order totals seen by ops) - but
// it will look wrong if used anywhere the buyer is shopping in another
// currency. For that, use CurrencyContext's format() instead, which
// converts to and labels the buyer's selected currency. When a screen shows
// a formatMoney() figure to someone who isn't necessarily thinking in TZS
// (e.g. seller/admin dashboards), pair it with a visible "TZS" label so it's
// unambiguous which currency they're looking at - see SellerDashboard.jsx /
// AdminDashboard.jsx for the pattern.
export const formatMoney = (amount) => {
    const value = Number(amount) || 0;
    return `TZS ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
};

// Phase 1 (Remediation, E4): the four date formatters below used to
// hardcode "en-GB" regardless of the language the user has chosen in
// LanguageContext, so Kiswahili speakers still got English-formatted
// dates everywhere. Rather than adding a `language` argument to all
// four (and updating 50+ call sites across the app to thread it
// through), this follows the same module-scoped pattern client.js
// already uses for the CSRF token: LanguageContext calls
// setFormatLocale(language) once whenever the active language changes,
// and every formatter here just reads the current value. Call sites
// are unaffected.
let activeLocale = "en-GB";

// Exported so LanguageContext.jsx can keep this in sync with the
// user's chosen language. Maps "sw" to the "sw-TZ" locale string (the
// only Swahili region NEXORA operates in); anything else - including
// "en" - keeps the existing "en-GB" formatting.
export const setFormatLocale = (language) => {
    activeLocale = language === "sw" ? "sw-TZ" : "en-GB";
};

export const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString(activeLocale, {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
};

export const formatShortDate = (dateString) => {
    return new Date(dateString).toLocaleDateString(activeLocale, {
        day: "numeric",
        month: "short"
    });
};


// Date + time together, e.g. "5 Aug 2026, 14:30" - used for maintenance
// schedule windows where the exact time (not just the day) matters.
export const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString(activeLocale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
};

export const formatMonthYear = (dateString) => {
    return new Date(dateString).toLocaleDateString(activeLocale, {
        month: "short",
        year: "numeric"
    });
};