import { useState } from "react";
import ProductGrid from "../components/ProductGrid";
import ProductFilters from "../components/ProductFilters";
import NexoraSmartSearch from "../components/ai/NexoraSmartSearch";


export default function BrowseProducts() {
    const [filters, setFilters] = useState({});
    // Nexora AI-parsed filters (Phase B1, feature #2) are layered on top
    // of whatever ProductFilters last emitted, not a replacement for it -
    // the regular filter controls are spread second in the params below,
    // so any manual filter change always wins over a stale AI-parsed one.
    const [aiFilters, setAiFilters] = useState({});

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
            <div className="mb-8 animate-slide-up">
                <h1 className="font-display text-3xl mb-1">All products</h1>
                <p className="text-ash text-sm">Everything on NEXORA, across every department.</p>
            </div>

            <NexoraSmartSearch onApply={setAiFilters} />

            <ProductFilters onChange={setFilters} />

            <ProductGrid
                params={{ ...aiFilters, ...filters }}
                emptyTitle="No products yet"
                emptyHint="Check back soon as sellers list new products."
            />
        </div>
    );
}
