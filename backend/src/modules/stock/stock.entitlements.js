// What a subscription plan includes for Nexora Stock Management (Phase 8).
// The values live in subscription_plans.entitlements (JSON, editable by an admin);
// this file only knows the KEYS, how to validate them, and what to assume when a plan
// has none stored. Features are booleans; stock_max_items is a SOFT limit (a warning,
// never a block): null = no limit.

const FEATURES = [
    "stock_pos",           // use Stock Management at all (items, sales, purchases)
    "stock_reports",       // sales, stock, low-stock, daily close, debts reports
    "stock_cost_reports",  // profit, valuation and anything that reveals cost prices
    "stock_import_export", // CSV / XLSX import and CSV export
    "stock_staff_users",   // let staff sign in to the till (reserved for the staff-users feature)
    "stock_low_alerts"     // low-stock alerts by push / WhatsApp / SMS
];
const LIMITS = ["stock_max_items"];

// A paid plan with no entitlements stored yet (e.g. a plan an admin created before this
// release): the everyday tools, but not the extras.
const PAID_FALLBACK = {
    stock_pos: true, stock_reports: true, stock_cost_reports: false, stock_import_export: true,
    stock_staff_users: false, stock_low_alerts: true, stock_max_items: null
};
const ALL_ON = {
    stock_pos: true, stock_reports: true, stock_cost_reports: true, stock_import_export: true,
    stock_staff_users: true, stock_low_alerts: true, stock_max_items: null
};
const ALL_OFF = {
    stock_pos: false, stock_reports: false, stock_cost_reports: false, stock_import_export: false,
    stock_staff_users: false, stock_low_alerts: false, stock_max_items: 0
};

const parse = (raw) => {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "string") {
        try { return JSON.parse(raw); } catch (e) { return null; }
    }
    return typeof raw === "object" ? raw : null;
};

// Entitlements for a plan row: stored values over the fallback for that plan.
exports.forPlan = (planCode, raw) => {
    if (planCode === "free") return { ...ALL_OFF, ...(pick(parse(raw)) || {}) };
    return { ...PAID_FALLBACK, ...(pick(parse(raw)) || {}) };
};

const pick = (obj) => {
    if (!obj) return null;
    const out = {};
    FEATURES.forEach((k) => { if (typeof obj[k] === "boolean") out[k] = obj[k]; });
    LIMITS.forEach((k) => {
        if (obj[k] === null || (Number.isInteger(obj[k]) && obj[k] >= 0)) out[k] = obj[k];
    });
    return out;
};

exports.trial = () => ({ ...ALL_ON });
exports.none = () => ({ ...ALL_OFF });
exports.FEATURES = FEATURES;
exports.LIMITS = LIMITS;

// For the admin validator: an object with only known keys of the right type.
exports.isValid = (obj) => {
    if (obj === null) return true;
    if (typeof obj !== "object" || Array.isArray(obj)) return false;
    return Object.entries(obj).every(([k, v]) =>
        (FEATURES.includes(k) && typeof v === "boolean")
        || (LIMITS.includes(k) && (v === null || (Number.isInteger(v) && v >= 0))));
};
