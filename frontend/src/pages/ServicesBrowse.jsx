import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import ServiceGrid from "../components/ServiceGrid";
import ServiceFilters from "../components/ServiceFilters";
import ServiceCategoryCard from "../components/ServiceCategoryCard";

// Matches DepartmentCardSkeleton on the homepage, so the category grid
// here occupies the same space/shape while loading instead of popping in.
function ServiceCategoryCardSkeleton() {
    return (
        <div className="animate-pulse">
            <div className="aspect-[4/3] bg-line/50 rounded-xl" />
        </div>
    );
}

// Sentinel for "browse everything, no single category" - distinct from
// `null` (which means "show the category grid, nothing opened yet").
const ALL_SERVICES = { id: undefined, name: "All services" };

export default function ServicesBrowse() {
    const [categories, setCategories] = useState([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [openCategory, setOpenCategory] = useState(null);
    const [filters, setFilters] = useState({});
    const [search, setSearch] = useState("");

    useEffect(() => {
        api.get("/service-categories/browse")
            .then(({ data }) => setCategories(data.data))
            .catch(() => {})
            .finally(() => setCategoriesLoading(false));
    }, []);

    const selectCategory = (category) => {
        setOpenCategory(category);
        setFilters({ category_id: category.id });
        setSearch("");
    };

    const backToCategories = () => {
        setOpenCategory(null);
        setFilters({});
        setSearch("");
    };

    const submitSearch = (e) => {
        e.preventDefault();
        setFilters((prev) => ({ ...prev, search: search || undefined }));
    };

    // Inside a category (or "All services") - search bar, filters, and
    // results live here, the same way ProductFilters/ProductGrid only
    // show up once you've clicked into a department on the homepage,
    // never on the department grid itself.
    if (openCategory) {
        return (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
                <button
                    type="button"
                    onClick={backToCategories}
                    className="text-sm text-teal hover:underline mb-4 inline-block"
                >
                    ← All categories
                </button>

                <div className="mb-6 animate-slide-up">
                    <h1 className="font-display text-2xl mb-1">{openCategory.name}</h1>
                    <p className="text-ash text-sm">
                        {openCategory === ALL_SERVICES
                            ? "Every service listed on NEXORA, booked directly through the platform."
                            : `${openCategory.serviceCount} ${openCategory.serviceCount === 1 ? "service" : "services"} in this category.`}
                    </p>
                </div>

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

    // Landing view - just the category grid, kept as clean as the
    // homepage's "Shop by department" grid.
    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
            <div className="mb-8 animate-slide-up">
                <h1 className="font-display text-3xl mb-1">Services</h1>
                <p className="text-ash text-sm">
                    Accommodation, transportation, tours and more — booked directly through NEXORA.
                </p>
            </div>

            {categoriesLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
                    {Array.from({ length: 5 }).map((_, i) => <ServiceCategoryCardSkeleton key={i} />)}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
                    {categories.map((category, i) => (
                        <ServiceCategoryCard
                            key={category.id}
                            category={category}
                            index={i}
                            onSelect={() => selectCategory(category)}
                        />
                    ))}
                </div>
            )}

            <div className="text-center mt-8">
                <button
                    type="button"
                    onClick={() => selectCategory(ALL_SERVICES)}
                    className="text-sm text-teal hover:underline"
                >
                    Or browse all services →
                </button>
            </div>
        </div>
    );
}

