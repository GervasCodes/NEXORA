import { useEffect, useState } from "react";
import api from "../api/client";
import ServiceCategoryCard from "../components/ServiceCategoryCard";
import PageMeta from "../components/PageMeta";

function ServiceCategoryCardSkeleton() {
    return (
        <div className="animate-pulse">
            <div className="aspect-[4/3] bg-line/50 rounded-xl" />
        </div>
    );
}

// The "All services" hub - the services equivalent of Home.jsx's default
// (no-search) view, which shows nothing but DepartmentDiscovery. This page
// now shows nothing but the category grid the same way: no search bar, no
// filters, no service listing here. Each card links out to its own page
// (ServiceCategoryPage.jsx, at /services/category/:slug), and THAT page is
// where the search bar and min/max filters live, scoped to just that
// category - mirroring how DepartmentPage.jsx scopes ProductFilters to one
// department after Home.jsx's department grid.
export default function ServicesBrowse() {
    const [categories, setCategories] = useState([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        api.get("/service-categories/browse")
            .then(({ data }) => setCategories(data.data))
            .catch(() => setError("Couldn't load service categories right now."))
            .finally(() => setCategoriesLoading(false));
    }, []);

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
            <PageMeta title="Services" description="Accommodation, transportation, tours and more — booked directly through NEXORA." />
            <div className="mb-8 animate-slide-up">
                <h1 className="font-display text-3xl mb-1">Services</h1>
                <p className="text-ash text-sm">
                    Accommodation, transportation, tours and more — booked directly through NEXORA.
                </p>
            </div>

            <div className="mb-6">
                <h2 className="font-display text-xl mb-1">Browse by category</h2>
                <p className="text-ash text-sm">Find the right provider, organized the way you book.</p>
            </div>

            {error && <p className="text-coral">{error}</p>}

            {categoriesLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
                    {Array.from({ length: 7 }).map((_, i) => <ServiceCategoryCardSkeleton key={i} />)}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
                    {categories.map((category, i) => (
                        <ServiceCategoryCard
                            key={category.id}
                            category={category}
                            index={i}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
