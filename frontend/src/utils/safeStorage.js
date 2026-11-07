// Phase 1: the app reads localStorage/sessionStorage in dozens of places
// (contexts, API client, banners). In Safari private mode, with blocked
// site data, or with a full quota, those calls can THROW - and several run
// before the first render, which used to white-screen the whole app.
//
// installSafeStorage() is called once, first thing in main.jsx. For each of
// localStorage / sessionStorage it probes a write; if the real one throws it
// swaps in an in-memory Storage-compatible fallback, so every existing
// call site keeps working (values just don't persist past the tab).

const createMemoryStorage = () => {
    const data = new Map();
    return {
        get length() { return data.size; },
        key: (i) => Array.from(data.keys())[i] ?? null,
        getItem: (k) => (data.has(String(k)) ? data.get(String(k)) : null),
        setItem: (k, v) => { data.set(String(k), String(v)); },
        removeItem: (k) => { data.delete(String(k)); },
        clear: () => { data.clear(); }
    };
};

const isUsable = (name) => {
    try {
        const store = window[name];
        if (!store) return false;
        const probe = "__nexora_probe__";
        store.setItem(probe, "1");
        store.removeItem(probe);
        return true;
    } catch {
        return false;
    }
};

export function installSafeStorage() {
    if (typeof window === "undefined") return [];
    const replaced = [];
    ["localStorage", "sessionStorage"].forEach((name) => {
        if (isUsable(name)) return;
        try {
            Object.defineProperty(window, name, {
                value: createMemoryStorage(),
                configurable: true,
                writable: true
            });
            replaced.push(name);
        } catch {
            // Property can't be redefined in this browser; call sites that
            // already have their own try/catch still cope.
        }
    });
    return replaced;
}

// Direct helpers for new code that doesn't want to rely on the shim.
export const safeGet = (key, store = "localStorage") => {
    try { return window[store].getItem(key); } catch { return null; }
};
export const safeSet = (key, value, store = "localStorage") => {
    try { window[store].setItem(key, value); return true; } catch { return false; }
};
