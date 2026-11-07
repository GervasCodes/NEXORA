import { useCallback, useEffect, useRef, useState } from "react";
import { useDataSaver } from "../context/DataSaverContext";

/**
 * useInfiniteScroll - the sentinel + IntersectionObserver pattern that
 * ProductGrid and ServiceGrid used to hand-roll, extracted so every
 * paginated list behaves the same.
 *
 *   const { sentinelRef } = useInfiniteScroll({ hasMore, loading, error, onLoadMore });
 *   ...render list...
 *   <div ref={sentinelRef} />        // or <InfiniteScrollFooter sentinelRef={sentinelRef} />
 *
 * Safeguards:
 *  - never fires while a page is already loading (no double fetch);
 *  - never fires while `error` is set, so a failing request doesn't loop -
 *    the footer's Retry button is what resumes loading;
 *  - auto-load is switched off when data-saver is on (or `disabled` is
 *    passed), leaving the manual "Load more" button in
 *    InfiniteScrollFooter in charge;
 *  - the sentinel is tracked with a callback ref, so if the list is
 *    unmounted and remounted (e.g. a skeleton swap on filter change) the
 *    observer re-attaches to the new node instead of watching a detached one.
 * `rootMargin` prefetches ahead of the viewport (default 400px).
 *
 * Works without a DataSaverProvider (unit tests, error boundaries).
 */
export default function useInfiniteScroll({ hasMore, loading, error, onLoadMore, disabled = false, rootMargin = "400px" }) {
    const saver = useDataSaver();
    const [node, setNode] = useState(null);
    const sentinelRef = useCallback((el) => setNode(el), []);
    const loadRef = useRef(onLoadMore);
    loadRef.current = onLoadMore;

    const autoLoad = Boolean(hasMore) && !loading && !error && !disabled && !saver?.enabled;

    useEffect(() => {
        if (!node || !autoLoad || typeof IntersectionObserver === "undefined") return undefined;
        const observer = new IntersectionObserver(
            (entries) => { if (entries.some((e) => e.isIntersecting)) loadRef.current?.(); },
            { rootMargin }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [node, autoLoad, rootMargin]);

    return { sentinelRef, autoLoad };
}
