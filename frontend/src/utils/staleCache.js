// "Last known good" copies of public catalog responses, so a visitor who arrives while the API host is
// asleep (it can take tens of seconds to wake) sees the last data they had instead of an empty grid.
//
// Used only by api/client.js, and only as a FALLBACK: a fresh response always wins and always refreshes
// the saved copy. Deliberately conservative:
//   - only GET requests for an allow-list of PUBLIC catalog paths (never cart, orders, wallet, admin,
//     account, messages, ... - anything personal or sensitive is simply not on the list);
//   - saved per user (and per language), so one person's copy is never shown to another on a shared device;
//   - at most 24 hours old, at most 150 kB per entry and 40 entries in total (oldest dropped first);
//   - any storage problem (private mode, quota) is swallowed: the cache just does nothing.

const PREFIX = "nexora_stale:";
export const TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_ENTRY_CHARS = 150_000;
export const MAX_ENTRIES = 40;

// Paths relative to the API base URL (/api/v1). Public, non-personal catalog data only.
const CACHEABLE_PATH = /^\/(products|categories|service-categories|store-types|stores|services)(\/|$)/;

const storage = () => {
    try { return window.localStorage; } catch { return null; }
};

const pathOf = (url) => {
    const raw = String(url || "");
    const noOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
    const noQuery = noOrigin.split("?")[0];
    return noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
};

// Request config -> may a response for it be saved and later served stale?
export const isCacheable = (config) => {
    if (!config || config.skipStale) return false;
    if (String(config.method || "get").toLowerCase() !== "get") return false;
    return CACHEABLE_PATH.test(pathOf(config.url));
};

// Who is asking: the signed-in user's id, or "anon". Mirrors AuthContext's localStorage entry.
const owner = () => {
    try {
        const user = JSON.parse(storage()?.getItem("nexora_user") || "null");
        return user?.id ? `u${user.id}` : "anon";
    } catch {
        return "anon";
    }
};

const language = () => {
    try { return storage()?.getItem("nexora_language") || "en"; } catch { return "en"; }
};

const keyFor = (fullUrl) => `${PREFIX}${owner()}:${language()}:${fullUrl}`;

const allKeys = (store) => {
    const keys = [];
    for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    return keys;
};

const prune = (store, keep) => {
    const entries = allKeys(store).map((key) => {
        try { return { key, t: JSON.parse(store.getItem(key)).t || 0 }; } catch { return { key, t: 0 }; }
    }).sort((a, b) => a.t - b.t);
    entries.slice(0, Math.max(0, entries.length - keep)).forEach(({ key }) => store.removeItem(key));
};

// Save a successful response body. `fullUrl` is axios' getUri(config), which includes the query string.
export const saveResponse = (config, fullUrl, data, now = Date.now()) => {
    const store = storage();
    if (!store || !isCacheable(config) || !data || typeof data !== "object" || data.success === false) return false;
    try {
        const payload = JSON.stringify({ t: now, d: data });
        if (payload.length > MAX_ENTRY_CHARS) return false;
        const key = keyFor(fullUrl);
        try {
            store.setItem(key, payload);
        } catch {
            prune(store, Math.floor(MAX_ENTRIES / 2)); // probably out of space: make room once, then give up quietly
            store.setItem(key, payload);
        }
        prune(store, MAX_ENTRIES);
        return true;
    } catch {
        return false;
    }
};

// -> { data, savedAt } or null (missing, too old, unreadable).
export const loadResponse = (config, fullUrl, now = Date.now()) => {
    const store = storage();
    if (!store || !isCacheable(config)) return null;
    const key = keyFor(fullUrl);
    try {
        const entry = JSON.parse(store.getItem(key));
        if (!entry || typeof entry.t !== "number") return null;
        if (now - entry.t > TTL_MS) {
            store.removeItem(key);
            return null;
        }
        return { data: entry.d, savedAt: entry.t };
    } catch {
        return null;
    }
};

export const clearStaleCache = () => {
    const store = storage();
    if (!store) return;
    try { allKeys(store).forEach((key) => store.removeItem(key)); } catch { /* nothing to do */ }
};
