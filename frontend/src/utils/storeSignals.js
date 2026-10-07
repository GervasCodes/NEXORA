// Helpers for the public store page's signal row (sold count, typical
// reply time, today's opening hours). Pure functions, no fetching.

// Store hours are entered in the seller's local time, which for this
// marketplace is East Africa Time. Shoppers may be elsewhere, so "today"
// is always computed in this zone rather than the browser's.
const STORE_TIME_ZONE = "Africa/Dar_es_Salaam";
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Returns { status: "open"|"closed", open, close } for today, or null when
// the seller hasn't set hours at all (caller hides the line in that case).
export function getTodayHours(openingHours, now = new Date()) {
    if (!openingHours || typeof openingHours !== "object") return null;
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: STORE_TIME_ZONE })
        .format(now)
        .slice(0, 3)
        .toLowerCase();
    const key = DAY_KEYS.find((d) => d === weekday);
    const entry = key ? openingHours[key] : null;
    if (!entry || !entry.open || !entry.close) return { status: "closed" };
    return { status: "open", open: entry.open, close: entry.close };
}

// Converts a minute count into a { key, n } pair the caller translates,
// so the wording stays in the i18n dictionary.
export function formatReplyTime(minutes) {
    if (minutes === null || minutes === undefined) return null;
    if (minutes < 60) return { key: "store.replyMinutes", n: Math.max(1, minutes) };
    const hours = Math.round(minutes / 60);
    if (hours < 24) return { key: "store.replyHours", n: hours };
    return { key: "store.replyDays", n: Math.round(hours / 24) };
}
