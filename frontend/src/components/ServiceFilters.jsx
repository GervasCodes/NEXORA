import { useState } from "react";
import { useCurrency } from "../context/CurrencyContext";

const SORT_OPTIONS = [
    { value: "newest", label: "Newest" },
    { value: "price_low", label: "Price: low to high" },
    { value: "price_high", label: "Price: high to low" }
];

export default function ServiceFilters({ onChange }) {
    const { currency, toTzs } = useCurrency();

    const [minInput, setMinInput] = useState("");
    const [maxInput, setMaxInput] = useState("");
    const [sort, setSort] = useState("newest");

    const emit = (nextMinInput, nextMaxInput, nextSort) => {
        const minTzs = toTzs(nextMinInput);
        const maxTzs = toTzs(nextMaxInput);

        // Always include these three keys (as `undefined` when cleared),
        // never omit them - the parent (ServicesBrowse) merges this
        // object into its own filters state with `{ ...prev, ...next }`
        // because it also holds category_id/search from other controls.
        // An omitted key would leave a stale min_price/max_price behind
        // after "Clear"; an explicit `undefined` overwrites it.
        onChange({
            min_price: minTzs !== null ? minTzs : undefined,
            max_price: maxTzs !== null ? maxTzs : undefined,
            sort: nextSort || undefined
        });
    };

    const handleApply = () => emit(minInput, maxInput, sort);

    const handleSortChange = (e) => {
        const next = e.target.value;
        setSort(next);
        emit(minInput, maxInput, next);
    };

    const handleClear = () => {
        setMinInput("");
        setMaxInput("");
        emit("", "", sort);
    };

    const hasActiveFilters = minInput !== "" || maxInput !== "";

    return (
        <div className="flex flex-wrap items-end gap-3 mb-6 pb-6 border-b border-line">
            <div className="flex flex-col gap-1">
                <label htmlFor="service-filter-min-price" className="text-xs text-ash">
                    Min price ({currency})
                </label>
                <input
                    id="service-filter-min-price"
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
                <label htmlFor="service-filter-max-price" className="text-xs text-ash">
                    Max price ({currency})
                </label>
                <input
                    id="service-filter-max-price"
                    type="number"
                    min="0"
                    inputMode="decimal"
                    placeholder="No limit"
                    value={maxInput}
                    onChange={(e) => setMaxInput(e.target.value)}
                    onBlur={handleApply}
                    onKeyDown={(e) => e.key === "Enter" && handleApply()}
                    className="w-28 border border-line rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-ink"
                />
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
