

const STORAGE_KEY = "nexora_recent_searches";
const MAX_ENTRIES = 8;

function safeParse(json) {
    try {
        const parsed = JSON.parse(json);
        return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
    } catch {
        return [];
    }
}


function hasStorage() {
    return typeof window !== "undefined" && !!window.localStorage;
}

export function getRecentSearches() {
    if (!hasStorage()) return [];

    try {
        return safeParse(window.localStorage.getItem(STORAGE_KEY));
    } catch {
        return [];
    }
}


export function addRecentSearch(term) {
    const trimmed = (term || "").trim();
    if (!trimmed || !hasStorage()) return [];

    try {
        const existing = safeParse(window.localStorage.getItem(STORAGE_KEY));
        const deduped = existing.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
        const updated = [trimmed, ...deduped].slice(0, MAX_ENTRIES);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
    } catch {
        return [];
    }
}

export function clearRecentSearches() {
    if (!hasStorage()) return;
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage unavailable - nothing to clear.
    }
}
