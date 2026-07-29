import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import ServiceGrid from "../components/ServiceGrid";
import ServiceFilters from "../components/ServiceFilters";
import ServiceCategoryCard from "../components/ServiceCategoryCard";

export default function ServicesBrowse() {
    const [categories, setCategories] = useState([]);
    const [filters, setFilters] = useState({});
    const [search, setSearch] = useState("");

    useEffect(() => {
        api.get("/service-categories/browse").then(({ data }) => setCategories(data.data)).catch(() => {});
    }, []);

    const selectCategory = (categoryId) => {
        setFilters((prev) => ({ ...prev, category_id: categoryId || undefined }));
    };

    const submitSearch = (e) => {
        e.preventDefault();
        setFilters((prev) => ({ ...prev, search: search || undefined }));
    };

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
            <div className="mb-8 animate-slide-up">
                <h1 className="font-display text-3xl mb-1">Services</h1>
                <p className="text-ash text-sm">
                    Accommodation, transportation, tours and more — booked directly through NEXORA.
                </p>
            </div>

            {categories.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-2 mb-6">
                    <button
                        type="button"
                        onClick={() => selectCategory(undefined)}
                        aria-pressed={!filters.category_id}
                        className={`shrink-0 w-36 sm:w-40 h-full min-h-[7rem] rounded-xl border flex items-center justify-center text-sm font-medium transition-all ${
                            !filters.category_id ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
                        }`}
                    >
                        All services
                    </button>
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

            <form onSubmit={submitSearch} className="flex gap-2 mb-6 max-w-md">
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search services, providers..."
                    className="flex-1 border border-line rounded-md px-3 py-2 text-sm focus-ring"
                />
                <button type="submit" className="text-sm border border-line px-4 py-2 rounded-md hover:border-ink transition-colors">
                    Search
                </button>
            </form>

            <ServiceFilters onChange={(next) => setFilters((prev) => ({ ...prev, ...next }))} />

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

