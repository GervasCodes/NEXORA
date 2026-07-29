import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";
import ServiceCard from "./ServiceCard";

const PAGE_SIZE = 24;
const VIEW_STORAGE_KEY = "nexora_service_view";

function readStoredView() {
    if (typeof window === "undefined") return "grid";
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === "list" ? "list" : "grid";
}

function ServiceCardSkeleton({ layout }) {
    if (layout === "list") {
        return (
            <div className="animate-pulse flex gap-4 border border-line rounded-lg p-3">
                <div className="w-24 h-24 sm:w-32 sm:h-32 shrink-0 bg-line/50 rounded-md" />
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
                    <div className="h-2.5 w-1/3 bg-line/50 rounded" />
                    <div className="h-3.5 w-2/3 bg-line/50 rounded" />
                    <div className="h-3.5 w-1/4 bg-line/50 rounded" />
                </div>
            </div>
        );
    }

    return (
        <div className="animate-pulse">
            <div className="aspect-square bg-line/50 rounded-md mb-3" />
            <div className="h-2.5 w-2/3 bg-line/50 rounded mb-2" />
            <div className="h-3.5 w-full bg-line/50 rounded mb-2" />
            <div className="h-3.5 w-1/3 bg-line/50 rounded" />
        </div>
    );
}

function containerClass(layout) {
    return layout === "list"
        ? "flex flex-col gap-3"
        : "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5";
}

export default function ServiceGrid({ params, emptyTitle, emptyHint, onResults, emptyAction }) {
    const [services, setServices] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [layout, setLayout] = useState(readStoredView);
    const sentinelRef = useRef(null);

    const changeLayout = (next) => {
        setLayout(next);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(VIEW_STORAGE_KEY, next);
        }
    };

    // Same reasoning as ProductGrid.jsx - `params` is a fresh object every
    // render, so a stable string is used as the effect dependency.
    const paramsKey = JSON.stringify(params || {});

    useEffect(() => {
        setLoading(true);
        setError("");
        setPage(1);

        api.get("/services", { params: { ...JSON.parse(paramsKey), limit: PAGE_SIZE, page: 1 } })
            .then(({ data }) => {
                setServices(data.data);
                setTotalPages(data.pagination?.totalPages || 1);
                onResults?.(data.pagination?.total ?? data.data.length);
            })
            .catch(() => setError("Couldn't load services right now."))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paramsKey]);

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

    const viewToggle = (
        <div className="flex items-center justify-end gap-1 mb-4" role="group" aria-label="Service view">
            <button
                type="button"
                onClick={() => changeLayout("grid")}
                aria-label="Grid view"
                aria-pressed={layout === "grid"}
                className={`w-8 h-8 rounded-md flex items-center justify-center border transition-colors ${layout === "grid" ? "border-ink bg-ink text-paper" : "border-line text-ash hover:border-ink"}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <rect x="3" y="3" width="8" height="8" rx="1.5" />
                    <rect x="13" y="3" width="8" height="8" rx="1.5" />
                    <rect x="3" y="13" width="8" height="8" rx="1.5" />
                    <rect x="13" y="13" width="8" height="8" rx="1.5" />
                </svg>
            </button>
            <button
                type="button"
                onClick={() => changeLayout("list")}
                aria-label="List view"
                aria-pressed={layout === "list"}
                className={`w-8 h-8 rounded-md flex items-center justify-center border transition-colors ${layout === "list" ? "border-ink bg-ink text-paper" : "border-line text-ash hover:border-ink"}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <rect x="3" y="4" width="18" height="3.5" rx="1" />
                    <rect x="3" y="10.25" width="18" height="3.5" rx="1" />
                    <rect x="3" y="16.5" width="18" height="3.5" rx="1" />
                </svg>
            </button>
        </div>
    );

    if (error) return <p className="text-coral">{error}</p>;

    if (loading) {
        return (
            <>
                {viewToggle}
                <div className={containerClass(layout)}>
                    {Array.from({ length: 8 }).map((_, i) => <ServiceCardSkeleton key={i} layout={layout} />)}
                </div>
            </>
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
            {viewToggle}

            <div className={containerClass(layout)}>
                {services.map((service) => (
                    <ServiceCard key={service.id} service={service} layout={layout} />
                ))}
            </div>

            <div ref={sentinelRef} />
            {loadingMore && (
                <div className={`${containerClass(layout)} mt-4 sm:mt-5`}>
                    {Array.from({ length: 4 }).map((_, i) => <ServiceCardSkeleton key={i} layout={layout} />)}
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
