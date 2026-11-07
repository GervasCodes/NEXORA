import { newRequestId, syncOfflineSales } from "../api/stock";

// Nexora Stock Management (Phase 8): the offline till.
//
// A sale rung up with no connection is saved in IndexedDB on this device with an id made here
// (a UUID, the idempotency key), then sent to the server when the connection is back. The
// server records each key once, so sending a batch twice (a dropped response, two tabs) can't
// double a sale, and it never refuses a sale that already happened because stock or the date
// look wrong - it records it and flags the stock instead (see the API docs).
//
// Also keeps a small cache of items the seller has looked up, so the item search still works
// offline (with stock numbers that may be out of date - the screen says so).
//
// IndexedDB is not available everywhere (private windows, some embedded browsers). Then the
// same API works from memory for this page view only - the screen warns that a reload would
// lose the queue (see `persistent`).

const DB_NAME = "nexora-stock";
const DB_VERSION = 1;
const MAX_CACHED_ITEMS = 500;
const BATCH = 50;

let dbPromise = null;
const memory = { queue: new Map(), items: new Map() };
let persistent = false;
const listeners = new Set();

const openDb = () => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
        try {
            if (typeof indexedDB === "undefined" || !indexedDB) return resolve(null);
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "key" });
                if (!db.objectStoreNames.contains("items")) db.createObjectStore("items", { keyPath: "id" });
            };
            req.onsuccess = () => { persistent = true; resolve(req.result); };
            req.onerror = () => resolve(null);
            req.onblocked = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
    return dbPromise;
};

const tx = (db, store, mode, work) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = work(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && "result" in out ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
});

const all = async (store) => {
    const db = await openDb();
    if (!db) return [...memory[store].values()];
    return new Promise((resolve, reject) => {
        const req = db.transaction(store, "readonly").objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};
const put = async (store, value) => {
    const db = await openDb();
    if (!db) { memory[store].set(store === "queue" ? value.key : value.id, value); return; }
    await tx(db, store, "readwrite", (s) => s.put(value));
};
const del = async (store, key) => {
    const db = await openDb();
    if (!db) { memory[store].delete(key); return; }
    await tx(db, store, "readwrite", (s) => s.delete(key));
};

const emit = () => listeners.forEach((fn) => { try { fn(); } catch { /* a listener must never break the queue */ } });
export const subscribeQueue = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const isPersistent = async () => { await openDb(); return persistent; };

// ---- the queue
// payload = the sale body for POST /sales/sync (must contain idempotency_key); summary is
// what the screen shows while it waits (names / quantities / total / when).
export const queueSale = async (payload, summary) => {
    const key = payload.idempotency_key || newRequestId();
    const entry = {
        key, payload: { ...payload, idempotency_key: key }, summary: summary || null,
        queued_at: new Date().toISOString(), status: "pending", message: null
    };
    await put("queue", entry);
    emit();
    return entry;
};

export const listQueue = async () => (await all("queue")).sort((a, b) => a.queued_at.localeCompare(b.queued_at));
export const queueCounts = async () => {
    const rows = await all("queue");
    return { pending: rows.filter((r) => r.status === "pending").length, rejected: rows.filter((r) => r.status === "rejected").length };
};
export const discardQueued = async (key) => { await del("queue", key); emit(); };

// ---- sending
let flushing = null;

// Sends every waiting sale, oldest first, in batches. Never throws: the result says what
// happened. A failure of the whole request (no connection, server error, signed out, plan
// read-only) leaves everything queued for the next try; a sale the server rejects is kept,
// marked, so the seller can see why and discard it.
export const flushQueue = () => {
    if (flushing) return flushing;
    flushing = (async () => {
        const result = { synced: 0, replayed: 0, rejected: 0, flagged: 0, remaining: 0, blocked: null };
        try {
            const pending = (await listQueue()).filter((e) => e.status === "pending");
            for (let i = 0; i < pending.length; i += BATCH) {
                const chunk = pending.slice(i, i + BATCH);
                let res;
                try {
                    res = await syncOfflineSales(chunk.map((e) => e.payload));
                } catch (err) {
                    const code = err?.response?.data?.code;
                    result.blocked = code === "SUBSCRIPTION_REQUIRED" || code === "FEATURE_NOT_IN_PLAN" ? "plan"
                        : err?.response ? "server" : "offline";
                    break;
                }
                const byKey = new Map((res.results || []).map((r) => [r.key, r]));
                for (const entry of chunk) {
                    const r = byKey.get(entry.key);
                    if (!r) continue; // not answered: stays queued
                    if (r.status === "created" || r.status === "replayed") {
                        await del("queue", entry.key);
                        if (r.status === "created") result.synced += 1; else result.replayed += 1;
                        if (r.stock_flagged) result.flagged += 1;
                    } else {
                        await put("queue", { ...entry, status: "rejected", message: r.message || "Rejected" });
                        result.rejected += 1;
                    }
                }
            }
            result.remaining = (await queueCounts()).pending;
        } catch {
            result.blocked = result.blocked || "offline";
        } finally {
            flushing = null;
            emit();
        }
        return result;
    })();
    return flushing;
};

// ---- item cache for offline search
export const cacheItems = async (items) => {
    try {
        const db = await openDb();
        const rows = (items || []).filter((i) => i && i.id).map((i) => ({
            id: i.id, name: i.name, variant_label: i.variant_label || null, sku: i.sku || null, barcode: i.barcode || null,
            sell_price: i.sell_price, cost_price: i.cost_price ?? null, stock: i.stock, source: i.source, cached_at: Date.now()
        }));
        if (!rows.length) return;
        if (!db) { rows.forEach((r) => memory.items.set(r.id, r)); }
        else await tx(db, "items", "readwrite", (s) => { rows.forEach((r) => s.put(r)); });
        const cached = await all("items");
        if (cached.length > MAX_CACHED_ITEMS) {
            cached.sort((a, b) => a.cached_at - b.cached_at).slice(0, cached.length - MAX_CACHED_ITEMS).forEach((r) => del("items", r.id));
        }
    } catch { /* the cache is a convenience, never a failure */ }
};

export const searchCachedItems = async (q, limit = 20) => {
    const needle = String(q || "").trim().toLowerCase();
    const rows = await all("items");
    const hit = needle
        ? rows.filter((r) => `${r.name} ${r.variant_label || ""} ${r.sku || ""} ${r.barcode || ""}`.toLowerCase().includes(needle))
        : rows.sort((a, b) => b.cached_at - a.cached_at);
    return hit.slice(0, limit);
};

export const resetForTests = async () => {
    memory.queue.clear(); memory.items.clear(); listeners.clear(); flushing = null;
    const db = await openDb();
    if (db) {
        await tx(db, "queue", "readwrite", (s) => s.clear());
        await tx(db, "items", "readwrite", (s) => s.clear());
    }
};
