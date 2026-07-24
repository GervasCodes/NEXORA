import { useEffect, useState } from "react";
import api from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";

// Ratings a shopper can filter by, highest first - "4 stars & up" style,
// not an exact-match dropdown, so there's no point offering more than
// this (a "5 & up" option already exists as "only 5 stars").
const RATING_OPTIONS = [4, 3, 2, 1];

// Phase 3C: sort options, matching the fixed whitelist
// utils/productSort.js accepts on the backend. Ordered the way a
// shopper would expect to see them in a "Sort by" dropdown, not
// alphabetically or by backend key name.
const SORT_OPTIONS = [
    { value: "newest", labelKey: "filters.sortNewest" },
    { value: "price_low", labelKey: "filters.sortPriceLow" },
    { value: "price_high", labelKey: "filters.sortPriceHigh" },
    { value: "rating", labelKey: "filters.sortRating" }
];

// Phase 3A: price range + seller/store filters. Phase 3B: location
// (region) + minimum-rating filters, added the same way. Phase 3C: a
// "Sort by" dropdown, also added the same way. Shared by BrowseProducts,
// DepartmentPage, and Home's search results - anywhere ProductGrid is
// used against the public `/products` listing.
//
// Renders its own price inputs (in whatever currency the shopper has
// selected, converted to TZS before being reported), a seller dropdown
// (populated from GET /products/filters/sellers), a region dropdown
// (populated from GET /products/filters/regions), a rating dropdown, and
// a sort dropdown (fixed options, no fetch needed) - the two data-driven
// dropdowns are optionally scoped to `categoryId` so a department page
// only offers options that actually apply within it.
//
// Reports changes via `onChange({ min_price, max_price, seller_id,
// region, min_rating, sort })` - only defined keys are included, so the
// parent can spread the result straight into ProductGrid's `params`
// alongside `search`/`category_id` without needing to know which
// filters are currently active.
//
// "Clear filters" (see `hasActiveFilters`/`handleClear` below) resets
// price/seller/region/rating but deliberately leaves sort alone: sort is
// a display preference for how to view whatever's showing, not a filter
// that narrows the result set, so clearing filters shouldn't also throw
// away a shopper's chosen sort order.
//
// Phase 5C: `singleStore` hides the seller and region dropdowns and
// skips fetching their options entirely. Both exist to narrow a
// multi-seller listing down to one store/area - on a store page every
// product already belongs to the same seller and (since region comes
// from that seller's own profile) the same region, so both dropdowns
// would only ever offer a single, already-applied option. The caller
// is expected to supply `seller_id` itself (StorePage.jsx merges it
// into ProductGrid's `params` the same way DepartmentPage merges
// `category_id`) rather than this component managing it.
export default function ProductFilters({ categoryId, onChange, singleStore }) {
    const { currency, toTzs } = useCurrency();
    const { t } = useLanguage();

    const [minInput, setMinInput] = useState("");
    const [maxInput, setMaxInput] = useState("");
    const [sellerId, setSellerId] = useState("");
    const [sellers, setSellers] = useState([]);
    const [sellersError, setSellersError] = useState(false);
    const [region, setRegion] = useState("");
    const [regions, setRegions] = useState([]);
    const [regionsError, setRegionsError] = useState(false);
    const [minRating, setMinRating] = useState("");
    // Defaults to "newest" (not "") since, unlike the other dropdowns,
    // every SORT_OPTIONS entry is a real, selectable value - there's no
    // "no sort" placeholder option, so the controlled <select> below
    // always has a matching value to display.
    const [sort, setSort] = useState("newest");

    useEffect(() => {
        if (singleStore) return;

        setSellersError(false);

        api.get("/products/filters/sellers", { params: categoryId ? { category_id: categoryId } : {} })
            .then(({ data }) => setSellers(data.data))
            .catch(() => setSellersError(true));
    }, [categoryId, singleStore]);

    useEffect(() => {
        if (singleStore) return;

        setRegionsError(false);

        api.get("/products/filters/regions", { params: categoryId ? { category_id: categoryId } : {} })
            .then(({ data }) => setRegions(data.data))
            .catch(() => setRegionsError(true));
    }, [categoryId, singleStore]);

    // Resets the seller dropdown whenever the available seller list
    // changes (e.g. switching departments) and the previously-selected
    // seller isn't in the new list.
    useEffect(() => {
        if (sellerId && !sellers.some((seller) => String(seller.id) === sellerId)) {
            setSellerId("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sellers]);

    // Same reset behavior for the region dropdown.
    useEffect(() => {
        if (region && !regions.includes(region)) {
            setRegion("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [regions]);

    const emit = (nextMinInput, nextMaxInput, nextSellerId, nextRegion, nextMinRating, nextSort) => {
        const filters = {};

        const minTzs = toTzs(nextMinInput);
        const maxTzs = toTzs(nextMaxInput);
        if (minTzs !== null) filters.min_price = minTzs;
        if (maxTzs !== null) filters.max_price = maxTzs;
        if (nextSellerId) filters.seller_id = nextSellerId;
        if (nextRegion) filters.region = nextRegion;
        if (nextMinRating) filters.min_rating = nextMinRating;
        if (nextSort) filters.sort = nextSort;

        onChange(filters);
    };

    const handleApply = () => emit(minInput, maxInput, sellerId, region, minRating, sort);

    const handleSellerChange = (e) => {
        const next = e.target.value;
        setSellerId(next);
        emit(minInput, maxInput, next, region, minRating, sort);
    };

    const handleRegionChange = (e) => {
        const next = e.target.value;
        setRegion(next);
        emit(minInput, maxInput, sellerId, next, minRating, sort);
    };

    const handleRatingChange = (e) => {
        const next = e.target.value;
        setMinRating(next);
        emit(minInput, maxInput, sellerId, region, next, sort);
    };

    const handleSortChange = (e) => {
        const next = e.target.value;
        setSort(next);
        emit(minInput, maxInput, sellerId, region, minRating, next);
    };

    // Sort is intentionally left out of handleClear/hasActiveFilters -
    // see the component-level comment above for why.
    const handleClear = () => {
        setMinInput("");
        setMaxInput("");
        setSellerId("");
        setRegion("");
        setMinRating("");
        emit("", "", "", "", "", sort);
    };

    const hasActiveFilters = minInput !== "" || maxInput !== "" || (!singleStore && (sellerId !== "" || region !== "")) || minRating !== "";

    return (
        <div className="flex flex-wrap items-end gap-3 mb-6 pb-6 border-b border-line">
            <div className="flex flex-col gap-1">
                <label htmlFor="filter-min-price" className="text-xs text-ash">
                    {t("filters.minPrice")} ({currency})
                </label>
                <input
                    id="filter-min-price"
                    type="number"
                    min="0"
                    inputMode="decimal"
                    placeholder="0"
                    value={minInput}
                    onChange={(e) => setMinInput(e.target.value)}
                    onBlur={handleApply}
                    onKeyDown={(e) => e.key === "Enter" && handleApply()}
                    className="w-28 border border-line rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-ink"
                />
            </div>

            <div className="flex flex-col gap-1">
                <label htmlFor="filter-max-price" className="text-xs text-ash">
                    {t("filters.maxPrice")} ({currency})
                </label>
                <input
                    id="filter-max-price"
                    type="number"
                    min="0"
                    inputMode="decimal"
                    placeholder={t("filters.noLimit")}
                    value={maxInput}
                    onChange={(e) => setMaxInput(e.target.value)}
                    onBlur={handleApply}
                    onKeyDown={(e) => e.key === "Enter" && handleApply()}
                    className="w-28 border border-line rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-ink"
                />
            </div>

            {!singleStore && (
                <div className="flex flex-col gap-1">
                    <label htmlFor="filter-seller" className="text-xs text-ash">
                        {t("filters.store")}
                    </label>
                    <select
                        id="filter-seller"
                        value={sellerId}
                        onChange={handleSellerChange}
                        disabled={sellersError || sellers.length === 0}
                        className="w-44 border border-line rounded-md px-3 py-1.5 text-sm bg-paper focus:outline-none focus:border-ink disabled:opacity-50"
                    >
                        <option value="">{t("filters.allStores")}</option>
                        {sellers.map((seller) => (
                            <option key={seller.id} value={seller.id}>{seller.store_name}</option>
                        ))}
                    </select>
                </div>
            )}

            {!singleStore && (
                <div className="flex flex-col gap-1">
                    <label htmlFor="filter-region" className="text-xs text-ash">
                        {t("filters.location")}
                    </label>
                    <select
                        id="filter-region"
                        value={region}
                        onChange={handleRegionChange}
                        disabled={regionsError || regions.length === 0}
                        className="w-40 border border-line rounded-md px-3 py-1.5 text-sm bg-paper focus:outline-none focus:border-ink disabled:opacity-50"
                    >
                        <option value="">{t("filters.allLocations")}</option>
                        {regions.map((r) => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                </div>
            )}

            <div className="flex flex-col gap-1">
                <label htmlFor="filter-rating" className="text-xs text-ash">
                    {t("filters.rating")}
                </label>
                <select
                    id="filter-rating"
                    value={minRating}
                    onChange={handleRatingChange}
                    className="w-32 border border-line rounded-md px-3 py-1.5 text-sm bg-paper focus:outline-none focus:border-ink"
                >
                    <option value="">{t("filters.anyRating")}</option>
                    {RATING_OPTIONS.map((stars) => (
                        <option key={stars} value={stars}>
                            {"★".repeat(stars)} {t("filters.andUp")}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex flex-col gap-1">
                <label htmlFor="filter-sort" className="text-xs text-ash">
                    {t("filters.sortBy")}
                </label>
                <select
                    id="filter-sort"
                    value={sort}
                    onChange={handleSortChange}
                    className="w-40 border border-line rounded-md px-3 py-1.5 text-sm bg-paper focus:outline-none focus:border-ink"
                >
                    {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                    ))}
                </select>
            </div>

            {hasActiveFilters && (
                <button
                    type="button"
                    onClick={handleClear}
                    className="text-sm text-teal hover:underline pb-1.5"
                >
                    {t("filters.clear")}
                </button>
            )}
        </div>
    );
}
