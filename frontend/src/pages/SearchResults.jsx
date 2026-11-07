import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ProductGrid from "../components/ProductGrid";
import ProductFilters from "../components/ProductFilters";
import ServiceGrid from "../components/ServiceGrid";
import Breadcrumbs from "../components/ui/Breadcrumbs";
import PageMeta from "../components/PageMeta";
import { useLanguage } from "../context/LanguageContext";
import { logSearchMiss } from "../utils/seoMetrics";
import { fetchTrendingSearches } from "../api/search";

// Search results live at /search?search=...&tab=products|services.
// The page is noindex,follow with its canonical on /search, so result pages
// never compete with real listings in Google but their links are followed.
// Searches that find nothing are logged (utils/seoMetrics.js) so catalogue
// gaps are visible to admins.

// Fallback shown until the live list loads (or if it fails/comes back
// empty - a brand-new install with no search history yet). See
// search.service.js#getTrending for where the live list comes from.
const FALLBACK_TRENDING_SEARCHES = ["phone case", "sneakers", "wedding services", "solar lamp", "coffee"];

const TABS = ["products", "services"];

export default function SearchResults() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { t } = useLanguage();
    const search = searchParams.get("search") || "";
    const tabParam = searchParams.get("tab");
    const tab = TABS.includes(tabParam) ? tabParam : "products";
    const queryKey = searchParams.toString();

    // Price/sort intent extracted from a natural-language header search
    // (see SearchBox.jsx), layered under the manual ProductFilters values.
    const urlFilters = useMemo(() => {
        const out = {};
        const min = searchParams.get("min_price");
        const max = searchParams.get("max_price");
        const sort = searchParams.get("sort");
        if (min !== null && min !== "" && Number.isFinite(Number(min))) out.min_price = Number(min);
        if (max !== null && max !== "" && Number.isFinite(Number(max))) out.max_price = Number(max);
        if (["newest", "price_low", "price_high", "rating"].includes(sort)) out.sort = sort;
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryKey]);

    const [resultCount, setResultCount] = useState(null);
    const [filters, setFilters] = useState({});
    const [trendingSearches, setTrendingSearches] = useState(FALLBACK_TRENDING_SEARCHES);

    useEffect(() => {
        setResultCount(null);
    }, [queryKey]);

    useEffect(() => {
        fetchTrendingSearches()
            .then((terms) => { if (terms.length > 0) setTrendingSearches(terms); })
            .catch(() => {});
    }, []);

    const setTab = (next) => {
        const params = new URLSearchParams(searchParams);
        params.set("tab", next);
        setSearchParams(params, { replace: true });
    };

    const handleResults = (total) => {
        setResultCount(total);
        // Only an unfiltered product search that finds nothing is a catalogue gap.
        if (tab === "products" && total === 0 && search && Object.keys(filters).length === 0) {
            logSearchMiss(search, "products");
        }
    };

    const tabButton = (value, label) => (
        <button
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`h-11 px-4 border-b-2 text-sm transition-colors ${
                tab === value ? "border-ink text-ink font-medium" : "border-transparent text-ash hover:text-ink"
            }`}
        >
            {label}
        </button>
    );

    const trendingChips = (
        <div className="mb-8">
            <p className="text-xs uppercase tracking-widest text-ash mb-3">{t("search.trendingTitle")}</p>
            <div className="flex flex-wrap gap-2">
                {trendingSearches.map((term) => (
                    <Link
                        key={term}
                        to={`/search?search=${encodeURIComponent(term)}`}
                        className="inline-flex items-center h-11 px-4 rounded-full border border-line text-sm text-ash hover:border-ink hover:text-ink transition-colors"
                    >
                        {term}
                    </Link>
                ))}
            </div>
        </div>
    );

    const emptyAction = (
        <div className="flex items-center justify-center gap-4 mt-4">
            <Link to="/" className="text-sm text-teal hover:underline">{t("search.browseDepartments")}</Link>
            <Link to="/feed" className="text-sm text-teal hover:underline">{t("search.browseAll")}</Link>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
            <PageMeta
                title={search ? t("seo.search.titleFor", { term: search }) : t("seo.search.title")}
                description={t("seo.search.description")}
                noIndexFollow
            />

            <Breadcrumbs
                items={[
                    { label: t("nav.home"), href: "/" },
                    { label: t("seo.search.title") },
                ]}
            />

            <div className="mb-6 flex items-end justify-between flex-wrap gap-2">
                <div>
                    {search && (
                        <p className="text-xs uppercase tracking-widest text-ash mb-1">
                            {t("search.resultsFor", { term: search })}
                        </p>
                    )}
                    <h1 className="font-display text-3xl">{t("seo.search.title")}</h1>
                    {resultCount !== null && (
                        <p className="text-ash text-sm mt-1">
                            {resultCount === 1 ? t("search.resultCountOne") : t("search.resultCountMany", { count: resultCount })}
                        </p>
                    )}
                </div>
                <Link to="/" className="text-sm text-teal hover:underline shrink-0">
                    {t("search.clearSearch")}
                </Link>
            </div>

            <div role="tablist" aria-label={t("search.tabsLabel")} className="flex gap-2 border-b border-line mb-6">
                {tabButton("products", t("search.tabProducts"))}
                {tabButton("services", t("search.tabServices"))}
            </div>

            {!search && trendingChips}

            {tab === "products" ? (
                <>
                    <ProductFilters onChange={setFilters} syncUrl />
                    <ProductGrid
                        params={{ search, ...urlFilters, ...filters }}
                        onResults={handleResults}
                        emptyTitle={t("search.noResultsTitle", { term: search })}
                        emptyHint={t("search.noResultsHint")}
                        emptyAction={emptyAction}
                    />
                </>
            ) : (
                <ServiceGrid
                    params={{ search }}
                    onResults={handleResults}
                    emptyTitle={t("search.noResultsTitle", { term: search })}
                    emptyHint={t("search.noResultsHint")}
                    emptyAction={emptyAction}
                />
            )}
        </div>
    );
}
