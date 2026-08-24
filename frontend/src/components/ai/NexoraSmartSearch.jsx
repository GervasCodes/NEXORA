import { useState } from "react";
import { parseSearchQuery } from "../../api/ai";

// feature #2: smart product search. This never talks to the
// product listing directly - it only turns free text into the same
// {search, min_price, max_price, sort} shape ProductFilters already
// produces (see BrowseProducts.jsx), so the actual product query still
// goes through product.service.js#listProducts exactly as before.
export default function NexoraSmartSearch({ onApply }) {
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(false);
    const [lastAiGenerated, setLastAiGenerated] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const query = text.trim();
        if (!query || loading) return;

        setLoading(true);
        try {
            const result = await parseSearchQuery(query);
            const { search, min_price, max_price, sort } = result;
            const filters = { search: search || query };
            if (min_price !== null && min_price !== undefined) filters.min_price = min_price;
            if (max_price !== null && max_price !== undefined) filters.max_price = max_price;
            if (sort) filters.sort = sort;
            onApply(filters);
            setLastAiGenerated(result.aiGenerated);
        } catch {
            // Graceful degradation: worst case, search the raw text the
            // shopper typed - the product listing still works, just
            // without the extra AI-extracted price/sort filters.
            onApply({ search: query });
            setLastAiGenerated(false);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="mb-4">
            <div className="flex items-center gap-2 rounded-full glass-strong px-4 py-2.5">
                <span className="h-4 w-4 rounded-full bg-gradient-to-br from-azure-light to-azure-deep shrink-0" aria-hidden="true" />
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Try “running shoes under 50,000 TZS” — ask Nexora AI"
                    className="flex-1 bg-transparent focus-ring text-sm placeholder:text-ash"
                />
                <button
                    type="submit"
                    disabled={loading || !text.trim()}
                    className="text-sm font-medium text-azure disabled:opacity-50"
                >
                    {loading ? "Searching…" : "Search"}
                </button>
            </div>
            {lastAiGenerated === false && (
                <p className="text-xs text-ash mt-1 px-2">Nexora AI is unavailable right now - searching your exact words instead.</p>
            )}
        </form>
    );
}
