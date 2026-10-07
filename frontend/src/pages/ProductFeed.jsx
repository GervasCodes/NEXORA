import { useCallback, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import ProductGrid from "../components/ProductGrid";
import ProductFilters from "../components/ProductFilters";
import { useLanguage } from "../context/LanguageContext";
import { feedLink } from "../utils/feedLink";

// Full-screen swipe feed at its own URL (/feed?<filters>). Filters come from
// the query string, so a shared or bookmarked feed link reopens the same set.
// The last slide seen is remembered per query so Back restores position.
export default function ProductFeed() {
    const { t } = useLanguage();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();

    const queryKey = searchParams.toString();
    const params = useMemo(() => Object.fromEntries(searchParams.entries()), [queryKey]); // eslint-disable-line react-hooks/exhaustive-deps
    const storageKey = `nexora_feed_pos:${queryKey}`;

    // Re-read per query, so changing filters starts the feed at the top.
    const initialIndex = useMemo(() => {
        try { return Number(sessionStorage.getItem(storageKey)) || 0; } catch { return 0; }
    }, [storageKey]);

    // Filter changes rewrite the URL (scope like store/department is kept),
    // so the feed re-queries and the link stays shareable.
    const handleFilterChange = useCallback((filters) => {
        const next = feedLink({
            seller_id: searchParams.get("seller_id"),
            category_id: searchParams.get("category_id"),
            ...filters,
        });
        if (next !== location.pathname + location.search) navigate(next, { replace: true });
    }, [searchParams, location.pathname, location.search, navigate]);

    const handleIndexChange = useCallback((index) => {
        try { sessionStorage.setItem(storageKey, String(index)); } catch { /* storage unavailable */ }
    }, [storageKey]);

    const handleClose = useCallback(() => {
        // Came from inside the app: go back. Opened directly: go to browse.
        if (location.key !== "default") navigate(-1);
        else navigate("/products", { replace: true });
    }, [location.key, navigate]);

    return (
        <ProductGrid
            params={params}
            feedPage
            initialIndex={initialIndex}
            onIndexChange={handleIndexChange}
            onFeedClose={handleClose}
            feedFilterPanel={<ProductFilters onChange={handleFilterChange} />}
            emptyTitle={t("store.noProductsTitle")}
            emptyHint={t("browse.noProductsHint")}
        />
    );
}
