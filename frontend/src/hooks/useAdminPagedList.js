import { useCallback, useEffect, useRef, useState } from "react";
import api, { extractErrorMessage } from "../api/client";

// Server-paged, filterable list for admin screens. Calls an endpoint that
// returns { data: items, meta } when given page/pageSize/q/status params.
// Responses from superseded requests are ignored so fast filter changes
// can't show stale rows.
export default function useAdminPagedList(endpoint, { pageSize = 25, initialFilters = {}, onError, enabled = true } = {}) {
    const [items, setItems] = useState([]);
    const [meta, setMeta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [filters, setFilters] = useState(initialFilters);
    const [searchInput, setSearchInput] = useState("");
    const requestRef = useRef(0);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const fetchPage = useCallback((nextPage, nextFilters) => {
        const id = ++requestRef.current;
        setLoading(true);
        const params = { page: nextPage, pageSize };
        Object.entries(nextFilters).forEach(([key, value]) => {
            if (value) params[key] = value;
        });
        api.get(endpoint, { params })
            .then(({ data }) => {
                if (id !== requestRef.current) return;
                setItems(data.data);
                setMeta(data.meta ?? null);
            })
            .catch((err) => {
                if (id === requestRef.current) onErrorRef.current?.(extractErrorMessage(err));
            })
            .finally(() => {
                if (id === requestRef.current) setLoading(false);
            });
    }, [endpoint, pageSize]);

    useEffect(() => {
        if (enabled) fetchPage(1, initialFilters);
    }, [fetchPage, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

    const reload = useCallback(() => fetchPage(page, filters), [fetchPage, page, filters]);

    const changePage = (next) => {
        setPage(next);
        fetchPage(next, filters);
    };

    const applyFilters = (next) => {
        setFilters(next);
        setPage(1);
        fetchPage(1, next);
    };

    const submitSearch = (e) => {
        e?.preventDefault();
        applyFilters({ ...filters, q: searchInput.trim() });
    };

    return { items, meta, loading, page, filters, searchInput, setSearchInput, reload, changePage, applyFilters, submitSearch };
}
