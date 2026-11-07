// Phase 5: keeps the wizard's work (files + edits) in IndexedDB so a refresh,
// crash or lost connection doesn't lose a seller's photos. Every call is
// wrapped: private windows / blocked storage just mean "no persistence".
const DB_NAME = "nexora-media-drafts";
const STORE = "drafts";

const open = () =>
    new Promise((resolve, reject) => {
        try {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        } catch (err) {
            reject(err);
        }
    });

const run = async (mode, fn) => {
    try {
        const db = await open();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const req = fn(tx.objectStore(STORE));
            tx.oncomplete = () => {
                db.close();
                resolve(req?.result);
            };
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } catch {
        return undefined;
    }
};

// Only plain data + File/Blob objects are stored (structured clone).
const toStored = (state, meta) => ({
    savedAt: Date.now(),
    meta: meta || null,
    coverId: state.coverId,
    items: state.items.map(({ clientId, kind, file, url, edits, status, serverId, undecodable }) => ({
        clientId, kind, file, url, edits, status: status === "uploading" ? "queued" : status, serverId, undecodable
    }))
});

export const saveMediaDraft = (key, state, meta) => run("readwrite", (s) => s.put(toStored(state, meta), key));
export const loadMediaDraft = (key) => run("readonly", (s) => s.get(key));
export const clearMediaDraft = (key) => run("readwrite", (s) => s.delete(key));
