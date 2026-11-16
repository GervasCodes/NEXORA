import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";

/**
 * usePagedList - one correct implementation of "filtered list + Load more"
 * for the buyer history pages (Orders, Bookings, Returns, Disputes).
 *
 *   const list = usePagedList({
 *       url: "/orders",
 *       params: filters,                                  // changes are debounced
 *       pick: (body) => ({ items: body.data.orders, pagination: body.data.pagination })
 *   });
 *
 * What it fixes compared with the hand-rolled copies it replaces:
 *  - the first page and "Load more" are separate states, so a failed
 *    "Load more" keeps the rows already on screen and offers Retry instead
 *    of replacing the whole list with an error (Orders) or failing silently
 *    (Bookings, Returns, Disputes);
 *  - a response that belongs to an older filter set is dropped, so a slow
 *    "Load more" (or first page) can never be appended to a newer list;
 *  - the very first page is fetched immediately (the old code waited out the
 *    350ms filter debounce on mount); later filter changes are debounced;
 *  - rows are de-duplicated by id when a page overlaps the previous one
 *    (new orders arriving between pages) so React keys never collide;
 *  - `hasLoaded` lets the page show a full-page skeleton ONLY on the first
 *    load. Re-fetches after a filter change keep the filter bar mounted, so a
 *    search box no longer loses focus mid-typing.
 *
 * `pick(body)` must return { items: [], pagination: { page, totalPages } }.
 * `timeout` (ms) is optional and only sent when given; api/client.js already
 * retries and circuit-breaks no-response failures, so it is not forced here.
 */
export default function usePagedList({ url, params, pick, debounceMs = 350, timeout }) {
    const [items, setItems] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [loadMoreError, setLoadMoreError] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);

    const paramsKey = JSON.stringify(params || {});
    const seqRef = useRef(0);
    const busyRef = useRef(false);
    const paginationRef = useRef(null);
    const activeKeyRef = useRef(null); // params of the list currently on screen
    const fetchedKeyRef = useRef(null); // last params a page-1 fetch was started for
    const pickRef = useRef(pick);
    pickRef.current = pick;

    const fetchFirst = useCallback((key) => {
        const seq = ++seqRef.current;
        activeKeyRef.current = key;
        busyRef.current = true;
        setLoading(true);
        setError(null);
        setLoadMoreError(false);
        setLoadingMore(false);

        api.get(url, { params: { ...JSON.parse(key), page: 1 }, ...(timeout ? { timeout } : {}) })
            .then(({ data }) => {
                if (seq !== seqRef.current) return;
                const next = pickRef.current(data);
                paginationRef.current = next.pagination || null;
                setItems(next.items || []);
                setPagination(next.pagination || null);
            })
            .catch((err) => {
                if (seq !== seqRef.current) return;
                paginationRef.current = null;
                setItems([]);
                setPagination(null);
                setError(err || new Error("Request failed"));
            })
            .finally(() => {
                if (seq !== seqRef.current) return;
                busyRef.current = false;
                setLoading(false);
                setHasLoaded(true);
            });
    }, [url, timeout]);

    useEffect(() => {
        if (fetchedKeyRef.current === paramsKey) return undefined;
        const delay = fetchedKeyRef.current === null ? 0 : debounceMs;
        const timer = setTimeout(() => {
            fetchedKeyRef.current = paramsKey;
            fetchFirst(paramsKey);
        }, delay);
        return () => clearTimeout(timer);
    }, [paramsKey, debounceMs, fetchFirst]);

    const loadMore = useCallback(() => {
        const pg = paginationRef.current;
        if (busyRef.current || !pg || !(pg.page < pg.totalPages)) return;

        const seq = seqRef.current;
        busyRef.current = true;
        setLoadingMore(true);
        setLoadMoreError(false);

        api.get(url, { params: { ...JSON.parse(activeKeyRef.current || "{}"), page: pg.page + 1 }, ...(timeout ? { timeout } : {}) })
            .then(({ data }) => {
                if (seq !== seqRef.current) return;
                const next = pickRef.current(data);
                paginationRef.current = next.pagination || pg;
                setPagination(next.pagination || pg);
                setItems((prev) => {
                    const seen = new Set(prev.map((row) => row.id));
                    return [...prev, ...(next.items || []).filter((row) => !seen.has(row.id))];
                });
            })
            .catch(() => { if (seq === seqRef.current) setLoadMoreError(true); })
            .finally(() => {
                if (seq !== seqRef.current) return;
                busyRef.current = false;
                setLoadingMore(false);
            });
    }, [url, timeout]);

    const reload = useCallback(() => {
        fetchedKeyRef.current = paramsKey;
        fetchFirst(paramsKey);
    }, [paramsKey, fetchFirst]);

    const body = error?.response?.data;
    const maintenance = body?.code === "MODULE_MAINTENANCE" ? (body.message || "This section is under maintenance. Please try again shortly.") : null;

    return {
        items,
        pagination,
        loading,
        loadingMore,
        error: maintenance !== null ? null : error,
        maintenance,
        loadMoreError,
        hasLoaded,
        hasMore: Boolean(pagination && pagination.page < pagination.totalPages),
        loadMore,
        reload
    };
}
