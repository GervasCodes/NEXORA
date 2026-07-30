import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import ServiceGrid from "../components/ServiceGrid";
import ServiceFilters from "../components/ServiceFilters";
import ServiceCategoryCard from "../components/ServiceCategoryCard";

function ServiceCategoryCardSkeleton() {
    return (
        <div className="animate-pulse">
            <div className="aspect-[4/3] bg-line/50 rounded-xl" />
        </div>
    );
}

export default function ServicesBrowse() {
    const [categories, setCategories] = useState([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [filters, setFilters] = useState({});
    const [search, setSearch] = useState("");

    useEffect(() => {
        api.get("/service-categories/browse")
            .then(({ data }) => setCategories(data.data))
            .catch(() => {})
            .finally(() => setCategoriesLoading(false));
    }, []);

    const selectCategory = (categoryId) => {
        setFilters((prev) => ({ ...prev, category_id: categoryId || undefined }));
    };

    const submitSearch = (e) => {
        e.preventDefault();
        setFilters((prev) => ({ ...prev, search: search || undefined }));
    };

    const totalCount = categories.reduce((sum, c) => sum + (c.serviceCount || 0), 0);

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
            <div className="mb-8 animate-slide-up">
                <h1 className="font-display text-3xl mb-1">Services</h1>
                <p className="text-ash text-sm">
                    Accommodation, transportation, tours and more — booked directly through NEXORA.
                </p>
            </div>

            {/* Service categories - grid-aligned and styled like the homepage's
                "Shop by department" section, with the search bar and the rest
                of the browsing controls tucked inside this same block instead
                of stacking as separate bars underneath it. */}
            <div className="mb-8">
                <div className="mb-4 flex items-end justify-between flex-wrap gap-3">
                    <div>
                        <h2 className="font-display text-xl mb-1">Browse by category</h2>
                        <p className="text-ash text-sm">Find the right provider, organized the way you book.</p>
                    </div>
                    <form onSubmit={submitSearch} className="flex gap-2 w-full sm:w-auto sm:max-w-[15rem]">
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search services..."
                            className="flex-1 border border-line rounded-md px-3 py-1.5 text-sm focus-ring"
                        />
                        <button type="submit" className="text-sm border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors shrink-0">
                            Search
                        </button>
                    </form>
                </div>

                {categoriesLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5 mb-6">
                        {Array.from({ length: 5 }).map((_, i) => <ServiceCategoryCardSkeleton key={i} />)}
                    </div>
                ) : categories.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5 mb-6">
                        <ServiceCategoryCard
                            category={null}
                            totalCount={totalCount}
                            active={!filters.category_id}
                            onSelect={() => selectCategory(undefined)}
                        />
                        {categories.map((category, i) => (
                            <ServiceCategoryCard
                                key={category.id}
                                category={category}
                                index={i}
                                active={filters.category_id === category.id}
                                onSelect={() => selectCategory(category.id)}
                            />
                        ))}
                    </div>
                )}

                <ServiceFilters categoryId={filters.category_id} onChange={(next) => setFilters((prev) => ({ ...prev, ...next }))} />
            </div>

            <ServiceGrid
                params={filters}
                emptyTitle="No services yet"
                emptyHint="Check back soon as providers list new services."
                emptyAction={
                    <p className="mt-4 text-sm">
                        <Link to="/products" className="text-teal hover:underline">Browse products instead</Link>
                    </p>
                }
            />
        </div>
    );
}
