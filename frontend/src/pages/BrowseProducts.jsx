import { useState } from "react";
import ProductGrid from "../components/ProductGrid";
import ProductFilters from "../components/ProductFilters";


export default function BrowseProducts() {
    const [filters, setFilters] = useState({});

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
            <div className="mb-8">
                <h1 className="font-display text-3xl mb-1">All products</h1>
                <p className="text-ash text-sm">Everything on NEXORA, across every department.</p>
            </div>

            <ProductFilters onChange={setFilters} />

            <ProductGrid
                params={filters}
                emptyTitle="No products yet"
                emptyHint="Check back soon as sellers list new products."
            />
        </div>
    );
}
