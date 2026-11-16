import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";
import ServiceCard from "./ServiceCard";
import ErrorState from "./ui/ErrorState";
import InfiniteScrollFooter from "./ui/InfiniteScrollFooter";
import useInfiniteScroll from "../hooks/useInfiniteScroll";

const PAGE_SIZE = 24;
// A stalled request on a flaky mobile connection used to leave the grid on
// its skeleton forever (same fix as ProductGrid.jsx).
const REQUEST_TIMEOUT_MS = 10000;
const GRID_CLASS = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5";

export function ServiceCardSkeleton() {
    return (
        <div className="animate-pulse">
            <div className="aspect-square bg-line/50 rounded-md mb-3" />
            <div className="h-2.5 w-2/3 bg-line/50 rounded mb-2" />
            <div className="h-3.5 w-full bg-line/50 rounded mb-2" />
            <div className="h-3.5 w-1/3 bg-line/50 rounded" />
        </div>
    );
}

// startPage (optional): first page to load, for URL-addressable listings (?page=N).
// onResults receives (total, totalPages).
export default function ServiceGrid({ params, emptyTitle, emptyHint, onResults, emptyAction, startPage = 1 }) {
    const [services, setServices] = useState([]);
    const [page, setPage] = useState(startPage);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [loadMoreError, setLoadMoreError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    // Bumped whenever the list is reset, so a response from an older
    // filter set is dropped instead of being shown / appended.
    const generationRef = useRef(0);

    // Same reasoning as ProductGrid.jsx - `params` is a fresh object every
    // render, so a stable string is used as the effect dependency.
    const paramsKey = JSON.stringify(params || {});

    useEffect(() => {
        let ignore = false;
        generationRef.current += 1;
        setLoading(true);
        setError("");
        setLoadMoreError(false);
        setLoadingMore(false);
        setPage(startPage);

        api.get("/services", { params: { ...JSON.parse(paramsKey), limit: PAGE_SIZE, page: startPage }, timeout: REQUEST_TIMEOUT_MS })
            .then(({ data }) => {
                if (ignore) return;
                setServices(data.data);
                setTotalPages(data.pagination?.totalPages || 1);
                onResults?.(data.pagination?.total ?? data.data.length, data.pagination?.totalPages || 1);
            })
            .catch(() => { if (!ignore) setError("Couldn't load services right now."); })
            .finally(() => { if (!ignore) setLoading(false); });

        return () => { ignore = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paramsKey, startPage, retryCount]);

    const loadMore = useCallback(() => {
        if (loading || loadingMore || page >= totalPages) return;

        const nextPage = page + 1;
        const generation = generationRef.current;
        setLoadingMore(true);
        setLoadMoreError(false);

        api.get("/services", { params: { ...JSON.parse(paramsKey), limit: PAGE_SIZE, page: nextPage }, timeout: REQUEST_TIMEOUT_MS })
            .then(({ data }) => {
                if (generation !== generationRef.current) return;
                setServices((prev) => {
                    const seen = new Set(prev.map((s) => s.id));
                    return [...prev, ...data.data.filter((s) => !seen.has(s.id))];
                });
                setTotalPages(data.pagination?.totalPages || totalPages);
                setPage(nextPage);
            })
            .catch(() => { if (generation === generationRef.current) setLoadMoreError(true); })
            .finally(() => { if (generation === generationRef.current) setLoadingMore(false); });
    }, [loading, loadingMore, page, totalPages, paramsKey]);

    const { sentinelRef } = useInfiniteScroll({
        hasMore: page < totalPages,
        loading: loading || loadingMore,
        error: loadMoreError,
        onLoadMore: loadMore
    });

    if (error) {
        return (
            <ErrorState
                title="Couldn't load services"
                hint={error}
                onRetry={() => setRetryCount((n) => n + 1)}
            />
        );
    }

    if (loading) {
        if (services.length > 0) {
            return (
                <div aria-busy="true" className={`${GRID_CLASS} opacity-50 transition-opacity`}>
                    {services.map((service) => <ServiceCard key={service.id} service={service} />)}
                </div>
            );
        }
        return (
            <div className={GRID_CLASS}>
                {Array.from({ length: 8 }).map((_, i) => <ServiceCardSkeleton key={i} />)}
            </div>
        );
    }

    if (services.length === 0) {
        return (
            <div className="text-center py-24">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-line/40 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-ash">
                        <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                    </svg>
                </div>
                <p className="font-display text-xl mb-1">{emptyTitle || "Nothing here yet"}</p>
                <p className="text-ash text-sm">{emptyHint || "Try a different search or check back soon."}</p>
                {emptyAction}
            </div>
        );
    }

    return (
        <>
            <div className={GRID_CLASS}>
                {services.map((service) => (
                    <ServiceCard key={service.id} service={service} />
                ))}
            </div>

            <InfiniteScrollFooter
                className="mt-4 sm:mt-5"
                sentinelRef={sentinelRef}
                hasMore={page < totalPages}
                loading={loadingMore}
                error={loadMoreError}
                onLoadMore={loadMore}
                skeleton={(
                    <div className={GRID_CLASS}>
                        {Array.from({ length: 4 }).map((_, i) => <ServiceCardSkeleton key={i} />)}
                    </div>
                )}
            />
        </>
    );
}
