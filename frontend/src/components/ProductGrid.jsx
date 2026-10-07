import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useLanguage } from "../context/LanguageContext";
import ProductCard from "./ProductCard";
import ProductSwipeFeed from "./ProductSwipeFeed";
import EmptyState from "./ui/EmptyState";
import ErrorState from "./ui/ErrorState";

const PAGE_SIZE = 24;
// Phase 6.1 follow-up: the /products request here had no per-request
// timeout, unlike useUnreadMessagesCount.js and NotificationBell.jsx's
// polls, both of which were fixed under Phase 5 (production error fixes)
// for the exact same symptom - a stalled request on a flaky mobile
// connection (ERR_QUIC_PROTOCOL_ERROR / QUIC_NETWORK_IDLE_TIMEOUT per
// production logs) hanging until the browser's own, much longer,
// network-level timeout. A hung request here means `loading` never
// clears, so the grid sits on its skeleton state indefinitely - which
// would present as "products not visible" exactly as reported. This
// wasn't reproduced live (still no phone/dev-tools access), but it's
// the same confirmed bug class already fixed twice elsewhere in this
// codebase for the same "flaky mobile connection" cause, applied here
// where it was missing rather than a new guess.
const REQUEST_TIMEOUT_MS = 10000;

export function ProductCardSkeleton() {
    return (
        <div className="animate-pulse">
            <div className="aspect-square bg-line/50 rounded-md mb-3" />
            <div className="h-2.5 w-2/3 bg-line/50 rounded mb-2" />
            <div className="h-3.5 w-full bg-line/50 rounded mb-2" />
            <div className="h-3.5 w-1/3 bg-line/50 rounded" />
        </div>
    );
}

const GRID_CLASS = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5";

// startPage (optional): first page to load, for URL-addressable listings (?page=N).
// onResults receives (total, totalPages).
export default function ProductGrid({ params, emptyTitle, emptyHint, onResults, emptyAction, forceFeedOnly = false, onFeedClose, startPage = 1, feedPage = false, initialIndex = 0, onIndexChange, feedFilterPanel }) {
    const { t } = useLanguage();
    const [products, setProducts] = useState([]);
    const [page, setPage] = useState(startPage);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [retryCount, setRetryCount] = useState(0);
    const sentinelRef = useRef(null);
    const viewToggleRef = useRef(null);
    // The swipe feed is an overlay launched from the toolbar button below.
    // forceFeedOnly (Browse All - see BrowseProducts.jsx) opens it immediately.
    const [feedOpen, setFeedOpen] = useState(forceFeedOnly);
    // forceFeedOnly's one way back to the plain listing is
    // the feed's own "Filters" button, which needs the plain product list
    // visible underneath while filters are open. Once a filter change
    // brings back a fresh result set, hop straight back into swipe rather
    // than leaving the shopper stranded on a bare list - tracked here.
    const returnToFeedRef = useRef(false);

    // `params` is a fresh object every render, so a stable string is used
    // as the effect dependency instead of the object reference itself.
    const paramsKey = JSON.stringify(params || {});

    useEffect(() => {
        let ignore = false;
        setLoading(true);
        setError("");
        setPage(startPage);

        // Guard against an out-of-order response: if the filters/sort
        // change again before this request resolves (e.g. quickly
        // switching a dropdown, more likely on a slower/flakier mobile
        // connection), an earlier request finishing after a newer one
        // would otherwise overwrite the grid with stale results. Found
        // while re-checking Phase 6.1 - not the confirmed root cause of
        // the reported bug, but a real correctness gap in the same
        // fetch path.
        api.get("/products", { params: { ...JSON.parse(paramsKey), limit: PAGE_SIZE, page: startPage }, timeout: REQUEST_TIMEOUT_MS })
            .then(({ data }) => {
                if (ignore) return;
                setProducts(data.data);
                setTotalPages(data.pagination?.totalPages || 1);
                onResults?.(data.pagination?.total ?? data.data.length, data.pagination?.totalPages || 1);
            })
            .catch(() => { if (!ignore) setError("Couldn't load products right now."); })
            .finally(() => {
                if (ignore) return;
                setLoading(false);
                if (forceFeedOnly && returnToFeedRef.current) {
                    returnToFeedRef.current = false;
                    setFeedOpen(true);
                }
            });

        return () => { ignore = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paramsKey, retryCount, startPage]);

    const loadMore = useCallback(() => {
        if (loading || loadingMore || page >= totalPages) return;

        const nextPage = page + 1;
        setLoadingMore(true);

        api.get("/products", { params: { ...JSON.parse(paramsKey), limit: PAGE_SIZE, page: nextPage }, timeout: REQUEST_TIMEOUT_MS })
            .then(({ data }) => {
                setProducts((prev) => [...prev, ...data.data]);
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

    const closeFeed = useCallback(() => {
        if (onFeedClose) { onFeedClose(); return; }
        setFeedOpen(false);
    }, [onFeedClose]);

    // The filter controls live in the page that renders this grid (right
    // above it), so "Filters" from inside the feed closes the feed and
    // brings them into view rather than duplicating them in a sheet.
    const openFiltersFromFeed = useCallback(() => {
        if (forceFeedOnly) returnToFeedRef.current = true;
        setFeedOpen(false);
        // Wait a frame so the overlay's scroll lock is released first.
        requestAnimationFrame(() => {
            const target = forceFeedOnly
                ? document.querySelector("[data-product-filters]") || viewToggleRef.current
                : (viewToggleRef.current?.previousElementSibling || viewToggleRef.current);
            target?.scrollIntoView?.({ block: "start", behavior: "smooth" });
        });
    }, [forceFeedOnly]);

    const viewToggle = forceFeedOnly ? null : (
        <div ref={viewToggleRef} className="flex items-center justify-end gap-2 mb-4">
            <button
                type="button"
                onClick={() => setFeedOpen(true)}
                disabled={loading}
                aria-label={t("products.viewFeed")}
                className="w-11 h-11 rounded-md flex items-center justify-center border border-line text-ash hover:border-ink transition-colors disabled:opacity-50"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" aria-hidden="true">
                    <rect x="7" y="2" width="10" height="20" rx="2" />
                    <path d="M10.5 9.5v5l4-2.5-4-2.5Z" fill="currentColor" stroke="none" />
                </svg>
            </button>
        </div>
    );


    if (error) {
        return (
            <ErrorState
                title="Couldn't load products"
                hint={error}
                onRetry={() => setRetryCount((n) => n + 1)}
            />
        );
    }

    if (loading) {
        return (
            <>
                {viewToggle}
                {products.length > 0 ? (
                    <div aria-busy="true" className={`${GRID_CLASS} opacity-50 transition-opacity`}>
                        {products.map((product) => <ProductCard key={product.id} product={product} />)}
                    </div>
                ) : (
                    <div className={GRID_CLASS}>
                        {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
                    </div>
                )}
            </>
        );
    }

    if (products.length === 0) {
        return (
            <EmptyState
                title={emptyTitle || "Nothing here yet"}
                hint={emptyHint || "Try a different search or check back soon."}
                action={emptyAction}
            />
        );
    }

    // Feed-as-a-page (/feed): the swipe feed IS the page, so the grid is
    // never rendered underneath it.
    if (feedPage) {
        return (
            <ProductSwipeFeed
                products={products}
                hasMore={page < totalPages}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
                onClose={onFeedClose}
                filterPanel={feedFilterPanel}
                initialIndex={initialIndex}
                onIndexChange={onIndexChange}
            />
        );
    }

    return (
        <>
            {viewToggle}

            <div className={GRID_CLASS}>
                {products.map((product, index) => (
                    <ProductCard key={product.id} product={product} priority={index < 4} />
                ))}
            </div>

            {/* Sentinel for infinite scroll, plus a manual fallback for
                anyone whose browser/extensions block IntersectionObserver. */}
            <div ref={sentinelRef} />
            {loadingMore && (
                <div className={`${GRID_CLASS} mt-4 sm:mt-5`}>
                    {Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
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
            {page >= totalPages && products.length >= PAGE_SIZE && (
                <p className="text-center text-ash text-xs mt-8">You've reached the end.</p>
            )}

            {feedOpen && (
                <ProductSwipeFeed
                    products={products}
                    hasMore={page < totalPages}
                    loadingMore={loadingMore}
                    onLoadMore={loadMore}
                    onClose={closeFeed}
                    onOpenFilters={openFiltersFromFeed}
                />
            )}
        </>
    );
}
