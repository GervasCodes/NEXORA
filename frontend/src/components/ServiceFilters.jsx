import { useEffect, useState } from "react";
import api from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import Input from "./ui/Input";

const SORT_OPTIONS = [
    { value: "newest", label: "Newest" },
    { value: "price_low", label: "Price: low to high" },
    { value: "price_high", label: "Price: high to low" },
    { value: "rating", label: "Highest rated" }
];

// Customer Experience - same 4-and-up-through-1-and-up ladder
// as ProductFilters.jsx's RATING_OPTIONS.
const RATING_OPTIONS = [4, 3, 2, 1];

export default function ServiceFilters({ categoryId, onChange }) {
    const { currency, toTzs } = useCurrency();

    const [minInput, setMinInput] = useState("");
    const [maxInput, setMaxInput] = useState("");
    const [region, setRegion] = useState("");
    const [regions, setRegions] = useState([]);
    const [regionsError, setRegionsError] = useState(false);
    const [minRating, setMinRating] = useState("");
    const [sort, setSort] = useState("newest");

    // feeds the Location dropdown, same shape as
    // ProductFilters.jsx's own regions effect.
    useEffect(() => {
        setRegionsError(false);

        api.get("/services/filters/regions", { params: categoryId ? { category_id: categoryId } : {} })
            .then(({ data }) => setRegions(data.data))
            .catch(() => setRegionsError(true));
    }, [categoryId]);

    // Resets the region dropdown whenever the available region list
    // changes (e.g. switching categories) and the previously-selected
    // region isn't in the new list.
    useEffect(() => {
        if (region && !regions.includes(region)) {
            setRegion("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [regions]);

    const emit = (nextMinInput, nextMaxInput, nextRegion, nextMinRating, nextSort) => {
        const minTzs = toTzs(nextMinInput);
        const maxTzs = toTzs(nextMaxInput);

        // Always include every key (as `undefined` when cleared), never
        // omit them - the parent (ServicesBrowse) merges this object
        // into its own filters state with `{ ...prev, ...next }` because
        // it also holds category_id/search from other controls. An
        // omitted key would leave a stale filter behind after "Clear";
        // an explicit `undefined` overwrites it.
        onChange({
            min_price: minTzs !== null ? minTzs : undefined,
            max_price: maxTzs !== null ? maxTzs : undefined,
            region: nextRegion || undefined,
            min_rating: nextMinRating || undefined,
            sort: nextSort || undefined
        });
    };

    const handleApply = () => emit(minInput, maxInput, region, minRating, sort);

    const handleRegionChange = (e) => {
        const next = e.target.value;
        setRegion(next);
        emit(minInput, maxInput, next, minRating, sort);
    };

    const handleRatingChange = (e) => {
        const next = e.target.value;
        setMinRating(next);
        emit(minInput, maxInput, region, next, sort);
    };

    const handleSortChange = (e) => {
        const next = e.target.value;
        setSort(next);
        emit(minInput, maxInput, region, minRating, next);
    };

    const handleClear = () => {
        setMinInput("");
        setMaxInput("");
        setRegion("");
        setMinRating("");
        emit("", "", "", "", sort);
    };

    const hasActiveFilters = minInput !== "" || maxInput !== "" || region !== "" || minRating !== "";

    return (
        <div className="flex flex-wrap items-end gap-3 mb-6 pb-6 border-b border-line">
            <Input
                id="service-filter-min-price"
                label={`Min price (${currency})`}
                type="number"
                min="0"
                inputMode="decimal"
                placeholder="0"
                value={minInput}
                onChange={(e) => setMinInput(e.target.value)}
                onBlur={handleApply}
                onKeyDown={(e) => e.key === "Enter" && handleApply()}
                className="w-28 !py-1.5"
            />

            <Input
                id="service-filter-max-price"
                label={`Max price (${currency})`}
                type="number"
                min="0"
                inputMode="decimal"
                placeholder="No limit"
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value)}
                onBlur={handleApply}
                onKeyDown={(e) => e.key === "Enter" && handleApply()}
                className="w-28 !py-1.5"
            />

            <div className="flex flex-col gap-1">
                <label htmlFor="service-filter-region" className="text-xs text-ash">
                    Location
                </label>
                <select
                    id="service-filter-region"
                    value={region}
                    onChange={handleRegionChange}
                    disabled={regionsError || regions.length === 0}
                    className="w-40 border border-line rounded-md px-3 py-1.5 text-sm bg-paper focus:outline-none focus:border-ink disabled:opacity-50"
                >
                    <option value="">All locations</option>
                    {regions.map((r) => (
                        <option key={r} value={r}>{r}</option>
                    ))}
                </select>
            </div>

            <div className="flex flex-col gap-1">
                <label htmlFor="service-filter-rating" className="text-xs text-ash">
                    Rating
                </label>
                <select
                    id="service-filter-rating"
                    value={minRating}
                    onChange={handleRatingChange}
                    className="w-32 border border-line rounded-md px-3 py-1.5 text-sm bg-paper focus:outline-none focus:border-ink"
                >
                    <option value="">Any rating</option>
                    {RATING_OPTIONS.map((stars) => (
                        <option key={stars} value={stars}>
                            {"★".repeat(stars)} & up
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex flex-col gap-1">
                <label htmlFor="service-filter-sort" className="text-xs text-ash">
                    Sort by
                </label>
                <select
                    id="service-filter-sort"
                    value={sort}
                    onChange={handleSortChange}
                    className="w-44 border border-line rounded-md px-3 py-1.5 text-sm bg-paper focus:outline-none focus:border-ink"
                >
                    {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
            </div>

            {hasActiveFilters && (
                <button
                    type="button"
                    onClick={handleClear}
                    className="text-sm text-teal hover:underline pb-1.5"
                >
                    Clear
                </button>
            )}
        </div>
    );
}
