import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import { useLanguage } from "../context/LanguageContext";


const RATING_OPTIONS = [4, 3, 2, 1];

// Note ( Icon & Empty-State Consistency): the ★ glyph below is
// left as plain text on purpose - it's rendered inside a native
// <option>, which can only ever show text, not an SVG icon like the
// StarIcon used everywhere else star ratings appear.


const SORT_OPTIONS = [
    { value: "newest", labelKey: "filters.sortNewest" },
    { value: "price_low", labelKey: "filters.sortPriceLow" },
    { value: "price_high", labelKey: "filters.sortPriceHigh" },
    { value: "rating", labelKey: "filters.sortRating" }
];


const EMPTY = {
    sellerId: "",
    region: "",
    minRating: "",
    sort: "newest",
    minPrice: "",
    maxPrice: "",
    inStock: false,
    onSale: false,
    verified: false,
};

// Maps the controls' state to the query params the listing API reads.
function buildFilters(v) {
    const filters = {};
    if (v.sellerId) filters.seller_id = v.sellerId;
    if (v.region) filters.region = v.region;
    if (v.minRating) filters.min_rating = v.minRating;
    if (v.sort) filters.sort = v.sort;
    if (v.minPrice) filters.min_price = v.minPrice;
    if (v.maxPrice) filters.max_price = v.maxPrice;
    if (v.inStock) filters.in_stock = "1";
    if (v.onSale) filters.on_sale = "1";
    if (v.verified) filters.verified = "1";
    return filters;
}

const CONTROL = "h-11 border border-line rounded-md px-3 text-base bg-paper focus:outline-none focus:border-ink disabled:opacity-50";
const TOGGLE = "h-11 px-4 rounded-full border text-sm transition-colors";

const FILTER_KEYS = ["seller_id", "region", "min_rating", "sort", "min_price", "max_price", "in_stock", "on_sale", "verified"];

// Reads filter values from the URL (syncUrl mode).
function valuesFromParams(sp) {
    return {
        sellerId: sp.get("seller_id") || "",
        region: sp.get("region") || "",
        minRating: sp.get("min_rating") || "",
        sort: sp.get("sort") || "newest",
        minPrice: sp.get("min_price") || "",
        maxPrice: sp.get("max_price") || "",
        inStock: sp.get("in_stock") === "1",
        onSale: sp.get("on_sale") === "1",
        verified: sp.get("verified") === "1",
    };
}

export default function ProductFilters({ categoryId, onChange, singleStore, syncUrl = false }) {
    const { t } = useLanguage();
    const [searchParams, setSearchParams] = useSearchParams();

    // syncUrl: values come from the URL, so back/forward and shared links
    // reproduce the same filters. Otherwise they live in component state.
    const filterKey = FILTER_KEYS.map((k) => searchParams.get(k) || "").join("|");
    const urlValues = useMemo(() => valuesFromParams(searchParams), [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
    const [localValues, setLocalValues] = useState(EMPTY);
    const values = syncUrl ? urlValues : localValues;

    // In syncUrl mode the parent hears about every URL filter change.
    useEffect(() => {
        if (syncUrl) onChange(buildFilters(urlValues));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterKey, syncUrl]);
    const [sellers, setSellers] = useState([]);
    const [sellersError, setSellersError] = useState(false);
    const [regions, setRegions] = useState([]);
    const [regionsError, setRegionsError] = useState(false);

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

    // Clears a selected seller/region that no longer exists in the new list
    // (e.g. after switching departments).
    useEffect(() => {
        if (!syncUrl && localValues.sellerId && !sellers.some((seller) => String(seller.id) === localValues.sellerId)) {
            setLocalValues((v) => ({ ...v, sellerId: "" }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sellers]);

    useEffect(() => {
        if (!syncUrl && localValues.region && !regions.includes(localValues.region)) {
            setLocalValues((v) => ({ ...v, region: "" }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [regions]);

    const update = (patch) => {
        const next = { ...values, ...patch };
        if (syncUrl) {
            const params = new URLSearchParams(searchParams);
            FILTER_KEYS.forEach((k) => params.delete(k));
            Object.entries(buildFilters(next)).forEach(([k, v]) => params.set(k, v));
            setSearchParams(params, { replace: true });
            return;
        }
        setLocalValues(next);
        onChange(buildFilters(next));
    };

    const hasActiveFilters = (!singleStore && (values.sellerId !== "" || values.region !== ""))
        || values.minRating !== "" || values.minPrice !== "" || values.maxPrice !== ""
        || values.inStock || values.onSale || values.verified;

    // Sort is deliberately kept when clearing - it's a view preference, not a filter.
    const handleClear = () => {
        update({ ...EMPTY, sort: values.sort });
    };

    // One removable chip per active filter. Chips are 44px.
    const chips = [];
    if (!singleStore && values.sellerId) {
        chips.push({ key: "sellerId", label: sellers.find((s) => String(s.id) === values.sellerId)?.store_name || t("filters.store") });
    }
    if (!singleStore && values.region) chips.push({ key: "region", label: values.region });
    if (values.minRating) chips.push({ key: "minRating", label: `${"★".repeat(Number(values.minRating))} ${t("filters.andUp")}` });
    if (values.minPrice) chips.push({ key: "minPrice", label: `${t("filters.priceMin")}: ${values.minPrice}` });
    if (values.maxPrice) chips.push({ key: "maxPrice", label: `${t("filters.priceMax")}: ${values.maxPrice}` });
    if (values.inStock) chips.push({ key: "inStock", label: t("filters.inStock") });
    if (values.onSale) chips.push({ key: "onSale", label: t("filters.onSale") });
    if (values.verified) chips.push({ key: "verified", label: t("filters.verifiedSellers") });

    const toggle = (key) => (
        <button
            type="button"
            onClick={() => update({ [key]: !values[key] })}
            aria-pressed={values[key]}
            className={`${TOGGLE} ${values[key] ? "border-ink bg-ink text-paper" : "border-line text-ash hover:border-ink"}`}
        >
            {t(TOGGLE_LABELS[key])}
        </button>
    );

    return (
        <div data-product-filters className="flex flex-wrap items-end gap-3 mb-6 pb-6 border-b border-line">
            {!singleStore && (
                <div className="flex flex-col gap-1">
                    <label htmlFor="filter-seller" className="text-xs text-ash">{t("filters.store")}</label>
                    <select
                        id="filter-seller"
                        value={values.sellerId}
                        onChange={(e) => update({ sellerId: e.target.value })}
                        disabled={sellersError || sellers.length === 0}
                        className={`${CONTROL} w-44`}
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
                    <label htmlFor="filter-region" className="text-xs text-ash">{t("filters.location")}</label>
                    <select
                        id="filter-region"
                        value={values.region}
                        onChange={(e) => update({ region: e.target.value })}
                        disabled={regionsError || regions.length === 0}
                        className={`${CONTROL} w-40`}
                    >
                        <option value="">{t("filters.allLocations")}</option>
                        {regions.map((r) => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                </div>
            )}

            <div className="flex flex-col gap-1">
                <label htmlFor="filter-min-price" className="text-xs text-ash">{t("filters.priceMin")}</label>
                <input
                    id="filter-min-price"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={values.minPrice}
                    onChange={(e) => update({ minPrice: e.target.value })}
                    className={`${CONTROL} w-28`}
                />
            </div>

            <div className="flex flex-col gap-1">
                <label htmlFor="filter-max-price" className="text-xs text-ash">{t("filters.priceMax")}</label>
                <input
                    id="filter-max-price"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={values.maxPrice}
                    onChange={(e) => update({ maxPrice: e.target.value })}
                    className={`${CONTROL} w-28`}
                />
            </div>

            <div className="flex flex-col gap-1">
                <label htmlFor="filter-rating" className="text-xs text-ash">{t("filters.rating")}</label>
                <select
                    id="filter-rating"
                    value={values.minRating}
                    onChange={(e) => update({ minRating: e.target.value })}
                    className={`${CONTROL} w-32`}
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
                <label htmlFor="filter-sort" className="text-xs text-ash">{t("filters.sortBy")}</label>
                <select
                    id="filter-sort"
                    value={values.sort}
                    onChange={(e) => update({ sort: e.target.value })}
                    className={`${CONTROL} w-40`}
                >
                    {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                    ))}
                </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {toggle("inStock")}
                {toggle("onSale")}
                {toggle("verified")}
            </div>

            {chips.length > 0 && (
                <div className="w-full flex flex-wrap gap-2">
                    {chips.map((chip) => (
                        <button
                            key={chip.key}
                            type="button"
                            onClick={() => update({ [chip.key]: EMPTY[chip.key] })}
                            aria-label={t("filters.removeChip", { label: chip.label })}
                            className="h-11 px-3 rounded-full border border-line text-sm inline-flex items-center gap-2 hover:border-ink transition-colors"
                        >
                            {chip.label}
                            <span aria-hidden="true" className="text-ash">×</span>
                        </button>
                    ))}
                </div>
            )}

            {hasActiveFilters && (
                <button
                    type="button"
                    onClick={handleClear}
                    className="h-11 px-2 text-sm text-teal hover:underline"
                >
                    {t("filters.clear")}
                </button>
            )}
        </div>
    );
}

const TOGGLE_LABELS = {
    inStock: "filters.inStock",
    onSale: "filters.onSale",
    verified: "filters.verifiedSellers",
};
