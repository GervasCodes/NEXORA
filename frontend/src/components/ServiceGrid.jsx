import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";
import ServiceCard from "./ServiceCard";

const PAGE_SIZE = 24;
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
    const sentinelRef = useRef(null);

    // Same reasoning as ProductGrid.jsx - `params` is a fresh object every
    // render, so a stable string is used as the effect dependency.
    const paramsKey = JSON.stringify(params || {});

    useEffect(() => {
        setLoading(true);
        setError("");
        setPage(startPage);

        api.get("/services", { params: { ...JSON.parse(paramsKey), limit: PAGE_SIZE, page: startPage } })
            .then(({ data }) => {
                setServices(data.data);
                setTotalPages(data.pagination?.totalPages || 1);
                onResults?.(data.pagination?.total ?? data.data.length, data.pagination?.totalPages || 1);
            })
            .catch(() => setError("Couldn't load services right now."))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paramsKey, startPage]);

    const loadMore = useCallback(() => {
        if (loading || loadingMore || page >= totalPages) return;

        const nextPage = page + 1;
        setLoadingMore(true);

        api.get("/services", { params: { ...JSON.parse(paramsKey), limit: PAGE_SIZE, page: nextPage } })
            .then(({ data }) => {
                setServices((prev) => [...prev, ...data.data]);
                setPage(nextPage);
            })
            .catch(() => {})
            .finally(() => setLoadingMore(false));
    }, [loading, loadingMore, page, totalPages, paramsKey]);

    useEffect(() => {
        const node = sentinelRef.current;
        if (!node) return;

        const observer = new IntersectionObserver(
            (entries) => { if (entries[0].isIntersecting) loadMore(); },
            { rootMargin: "400px" }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [loadMore]);

    if (error) return <p className="text-coral">{error}</p>;

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

            <div ref={sentinelRef} />
            {loadingMore && (
                <div className={`${GRID_CLASS} mt-4 sm:mt-5`}>
                    {Array.from({ length: 4 }).map((_, i) => <ServiceCardSkeleton key={i} />)}
                </div>
            )}
            {!loadingMore && page < totalPages && (
                <div className="text-center mt-8">
                    <button
                        onClick={loadMore}
                        className="text-sm border border-line px-5 py-2 rounded-full hover:border-ink transition-colors"
                    >
                        Load more
                    </button>
                </div>
            )}
        </>
    );
}
