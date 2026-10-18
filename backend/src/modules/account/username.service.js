const accountRepository = require("./account.repository");
const settingsService = require("../settings/settings.service");
const appError = require("../../utils/appError");
const {
    USERNAME_CHANGE_COOLDOWN_DAYS,
    normalizeUsername,
    checkUsernameRules,
    usernameBaseFromName,
    randomDigits
} = require("../../utils/username");

const DAY_MS = 24 * 60 * 60 * 1000;

const isDuplicateUsernameError = (error) =>
    error?.code === "ER_DUP_ENTRY" && /username/i.test(String(error.sqlMessage || error.message || ""));

exports.isDuplicateUsernameError = isDuplicateUsernameError;

// { available: true } or { available: false, reason: "invalid"|"reserved"|"taken" }.
// `excludeUserId` = the asking user's own id, so keeping their current name
// reads as available.
exports.checkAvailability = async (value, { excludeUserId = null } = {}) => {
    const username = normalizeUsername(value);
    const blocklist = await settingsService.getUsernameBlocklist();
    const ruleError = checkUsernameRules(username, blocklist);

    if (ruleError === "USERNAME_INVALID") return { available: false, reason: "invalid" };
    if (ruleError === "USERNAME_RESERVED") return { available: false, reason: "reserved" };

    const existing = await accountRepository.findByUsername(username, excludeUserId);
    if (existing) return { available: false, reason: "taken" };

    return { available: true };
};

// Throws an appError (USERNAME_INVALID / _RESERVED / _TAKEN) unless the name is
// usable. Used by registration before anything is uploaded or written.
exports.assertUsable = async (value, { excludeUserId = null, conn = null } = {}) => {
    const username = normalizeUsername(value);
    const blocklist = await settingsService.getUsernameBlocklist();
    const ruleError = checkUsernameRules(username, blocklist);
    if (ruleError) throw appError(ruleError, 400);

    const existing = await accountRepository.findByUsername(username, excludeUserId, conn);
    if (existing) throw appError("USERNAME_TAKEN", 409);

    return username;
};

// A free, rule-abiding username built from the person's first name plus
// digits, for signups that don't pick one (API clients, Google signup later).
exports.generateUnique = async (firstName, { conn = null } = {}) => {
    const blocklist = await settingsService.getUsernameBlocklist();
    const base = usernameBaseFromName(firstName);

    for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = `${base}${randomDigits(attempt < 6 ? 3 : 5)}`;
        if (checkUsernameRules(candidate, blocklist)) continue;
        const existing = await accountRepository.findByUsername(candidate, null, conn);
        if (!existing) return candidate;
    }

    // Practically unreachable; the unique index is still the final guard.
    return `user${Date.now().toString().slice(-9)}`;
};

// Account-settings change: rules, availability, then the guarded UPDATE that
// enforces "at most one change per 30 days". The first change after
// registration is always allowed (username_changed_at starts NULL).
exports.changeUsername = async (userId, value) => {
    const username = normalizeUsername(value);
    const state = await accountRepository.findUsernameState(userId);
    if (!state) throw appError("ACCOUNT_NOT_FOUND", 404);

    // Exactly the same text: nothing to do (and no cooldown is burned).
    if (state.username === username) return { username, unchanged: true };

    const blocklist = await settingsService.getUsernameBlocklist();
    const ruleError = checkUsernameRules(username, blocklist);
    if (ruleError) throw appError(ruleError, 400);

    const existing = await accountRepository.findByUsername(username, userId);
    if (existing) throw appError("USERNAME_TAKEN", 409);

    let changed;
    try {
        changed = await accountRepository.updateUsername(userId, username, USERNAME_CHANGE_COOLDOWN_DAYS);
    } catch (error) {
        if (isDuplicateUsernameError(error)) throw appError("USERNAME_TAKEN", 409);
        throw error;
    }

    if (!changed) {
        const daysLeft = state.username_changed_at
            ? Math.max(1, Math.ceil(
                (new Date(state.username_changed_at).getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * DAY_MS - Date.now()) / DAY_MS
            ))
            : USERNAME_CHANGE_COOLDOWN_DAYS;
        throw Object.assign(appError("USERNAME_CHANGE_TOO_SOON", 429), { params: { days: daysLeft } });
    }

    return { username, unchanged: false };
};

// When the person may change their name again (null = right now).
exports.nextChangeAt = (usernameChangedAt) => {
    if (!usernameChangedAt) return null;
    const next = new Date(new Date(usernameChangedAt).getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * DAY_MS);
    return next.getTime() > Date.now() ? next.toISOString() : null;
};
