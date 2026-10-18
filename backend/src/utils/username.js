// Username rules (round 5, phase 6). Pure helpers - no database access - so
// the same rules can be unit-checked and shared by registration, account
// settings and the availability endpoint.

const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

// Letters, digits, underscore and dot only.
const USERNAME_PATTERN = /^[A-Za-z0-9_.]+$/;

// Words nobody may use as a username (or as a dot/underscore-separated part
// of one), so nobody can pose as staff or the platform. The admin-editable
// blocklist in platform_settings adds to this list; it never replaces it.
const RESERVED_USERNAMES = Object.freeze([
    "admin", "administrator", "sysadmin", "superadmin", "root", "system",
    "nexora", "support", "help", "info", "contact", "team", "service", "services",
    "api", "www", "mail", "email", "noreply", "no_reply", "null", "undefined",
    "anonymous", "everyone", "nexorasupport", "nexoraadmin"
]);

// The brand name may not appear anywhere in a username ("nexora_deals").
const RESERVED_SUBSTRINGS = Object.freeze(["nexora"]);

const normalizeUsername = (value) => String(value ?? "").trim();

// Returns null when the format is fine, otherwise an error code that exists
// under `errors` in the i18n catalogs.
const validateUsernameFormat = (value) => {
    const username = normalizeUsername(value);
    if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) return "USERNAME_INVALID";
    if (!USERNAME_PATTERN.test(username)) return "USERNAME_INVALID";
    return null;
};

// `blocklist` is the already-parsed array from settingsService.getUsernameBlocklist().
const isReservedUsername = (value, blocklist = []) => {
    const lower = normalizeUsername(value).toLowerCase();
    const compact = lower.replace(/[._]/g, "");
    const parts = lower.split(/[._]+/).filter(Boolean);
    const blocked = new Set([...RESERVED_USERNAMES, ...blocklist.map((w) => String(w).toLowerCase())]);

    if (blocked.has(lower) || blocked.has(compact)) return true;
    if (parts.some((part) => blocked.has(part))) return true;
    return RESERVED_SUBSTRINGS.some((word) => compact.includes(word));
};

// Format + reserved checks in one go (availability in the database is a
// separate, async check). Returns an error code or null.
const checkUsernameRules = (value, blocklist = []) => {
    const formatError = validateUsernameFormat(value);
    if (formatError) return formatError;
    if (isReservedUsername(value, blocklist)) return "USERNAME_RESERVED";
    return null;
};

// "Amina" + 1042 -> "amina1042". Letters only from the first name (at most
// 10), "user" when there are none. The suffix is appended by the caller so it
// can be retried; this builds only the base.
const usernameBaseFromName = (firstName) => {
    const letters = String(firstName ?? "").replace(/[^A-Za-z]/g, "").toLowerCase().slice(0, 10);
    return letters.length >= 2 ? letters : "user";
};

const randomDigits = (count) => {
    let out = "";
    for (let i = 0; i < count; i += 1) out += Math.floor(Math.random() * 10);
    return out;
};

module.exports = {
    USERNAME_MIN,
    USERNAME_MAX,
    USERNAME_CHANGE_COOLDOWN_DAYS,
    RESERVED_USERNAMES,
    normalizeUsername,
    validateUsernameFormat,
    isReservedUsername,
    checkUsernameRules,
    usernameBaseFromName,
    randomDigits
};
