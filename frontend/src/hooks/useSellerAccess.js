import { useEffect, useState } from "react";
import api from "../api/client";

// Shared, short-lived cache of GET /subscriptions/access (trial / plan state)
// so TrialBanner and the seller menu's status pill - both mounted at once -
// make one request instead of one each. Best-effort: on failure the caller
// simply gets null and renders nothing.
const TTL_MS = 30000;
let cached = null;
let cachedAt = 0;
let inflight = null;

function load() {
    if (cached && Date.now() - cachedAt < TTL_MS) return Promise.resolve(cached);
    if (!inflight) {
        inflight = api
            .get("/subscriptions/access")
            .then(({ data }) => {
                cached = data.data || null;
                cachedAt = Date.now();
                return cached;
            })
            .catch(() => null)
            .finally(() => {
                inflight = null;
            });
    }
    return inflight;
}

export default function useSellerAccess() {
    const [access, setAccess] = useState(() => (cached && Date.now() - cachedAt < TTL_MS ? cached : null));

    useEffect(() => {
        let cancelled = false;
        load().then((value) => {
            if (!cancelled) setAccess(value);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    return access;
}
