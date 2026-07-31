import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

// Flow: Homepage -> Services -> Service category (mirrors DepartmentPage.jsx's
// Homepage -> Department -> Products flow). This page reuses the exact same
// "search bar + category grid" block as the Services hub (ServicesBrowse.jsx),
// so browsing feels identical whichever one a person lands on - the only
// difference is everything below is locked to this category's id, so the
// search bar and the grid never reach outside it.
export default function ServiceCategoryPage() {
    const { slug } = useParams();
    const [category, setCategory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [categories, setCategories] = useState([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [filters, setFilters] = useState({});
    const [search, setSearch] = useState("");

    useEffect(() => {
        setLoading(true);
        setError("");
        setFilters({});
        setSearch("");

        api.get(`/service-categories/${slug}`)
            .then(({ data }) => setCategory(data.data))
            .catch((err) => {
                if (err.response?.status === 404) {
                    setError("This service category couldn't be found.");
                } else {
                    setError("Couldn't load this category right now.");
                }
            })
            .finally(() => setLoading(false));
    }, [slug]);

    useEffect(() => {
        api.get("/service-categories/browse")
            .then(({ data }) => setCategories(data.data))
            .catch(() => {})
            .finally(() => setCategoriesLoading(false));
    }, []);

    const submitSearch = (e) => {
        e.preventDefault();
        setFilters((prev) => ({ ...prev, search: search || undefined }));
    };

    const totalCount = categories.reduce((sum, c) => sum + (c.serviceCount || 0), 0);

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
                <div className="animate-pulse h-40 bg-line/40 rounded-xl mb-8" />
            </div>
        );
    }

    if (error || !category) {
        return (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-24 text-center">
                <p className="font-display text-xl mb-2">{error || "Service category not found"}</p>
                <Link to="/services" className="text-sm text-teal hover:underline">← Back to all services</Link>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
            <div className="mb-8 animate-slide-up">
                <Link to="/services" className="text-ash hover:text-ink text-xs">← All services</Link>
                <h1 className="font-display text-3xl mt-2 mb-1">{category.name}</h1>
                {category.description && (
                    <p className="text-ash text-sm max-w-lg mb-1">{category.description}</p>
                )}
                <p className="text-ash text-xs">
                    {category.serviceCount} {category.serviceCount === 1 ? "service" : "services"}
                </p>
            </div>

            {/* Same search bar + category grid arrangement as the homepage
                (and the Services hub) - selecting a different category here
                just navigates to that category's own page. This page's
                search bar only ever searches inside {category.name}. */}
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
                            placeholder={`Search in ${category.name}...`}
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
                        <ServiceCategoryCard category={null} totalCount={totalCount} />
                        {categories.map((c, i) => (
                            <ServiceCategoryCard
                                key={c.id}
                                category={c}
                                index={i}
                                active={c.slug === slug}
                            />
                        ))}
                    </div>
                )}

                <ServiceFilters categoryId={category.id} onChange={(next) => setFilters((prev) => ({ ...prev, ...next }))} />
            </div>

            <ServiceGrid
                params={{ category_id: category.id, ...filters }}
                emptyTitle={`No services in ${category.name} yet`}
                emptyHint="Check back soon as providers list new services here."
                emptyAction={
                    <p className="mt-4 text-sm">
                        <Link to="/services" className="text-teal hover:underline">Browse all services instead</Link>
                    </p>
                }
            />
        </div>
    );
}
