import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import ServiceGrid from "../components/ServiceGrid";
import ServiceFilters from "../components/ServiceFilters";
import MaintenanceScreen from "../components/MaintenanceScreen";

// Flow: Homepage -> Services -> Service category (mirrors DepartmentPage.jsx's
// Homepage -> Department -> Products flow). Once a category is picked, this
// page is scoped to just that category - the same way DepartmentPage.jsx
// doesn't re-show the homepage's department grid once you're inside one, it
// only shows that department's own filters + product grid. The category
// picker (the grid + "All services" tile) lives one step back, on
// ServicesBrowse.jsx, and isn't repeated here.
export default function ServiceCategoryPage() {
    const { slug } = useParams();
    const [category, setCategory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [maintenance, setMaintenance] = useState(null);
    const [filters, setFilters] = useState({});
    const [search, setSearch] = useState("");

    const loadCategory = () => {
        setLoading(true);
        setError("");
        setMaintenance(null);
        setFilters({});
        setSearch("");

        api.get(`/service-categories/${slug}`)
            .then(({ data }) => setCategory(data.data))
            .catch((err) => {
                if (err.response?.data?.code === "DEPARTMENT_MAINTENANCE") {
                    setMaintenance({
                        name: err.response.data.data?.name,
                        message: err.response.data.message
                    });
                } else if (err.response?.status === 404) {
                    setError("This service category couldn't be found.");
                } else {
                    setError("Couldn't load this category right now.");
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadCategory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug]);

    const submitSearch = (e) => {
        e.preventDefault();
        setFilters((prev) => ({ ...prev, search: search || undefined }));
    };

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
                <div className="animate-pulse h-40 bg-line/40 rounded-xl mb-8" />
            </div>
        );
    }

    if (maintenance) {
        return (
            <MaintenanceScreen
                title={maintenance.name ? `${maintenance.name} is under maintenance` : "This service category is under maintenance"}
                message={maintenance.message}
                onRetry={loadCategory}
            />
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

            {/* Search + filters, scoped to this category only - the category
                grid itself was already picked from on the Services hub, so
                it isn't repeated here (mirrors DepartmentPage.jsx, which
                goes straight to ProductFilters + ProductGrid). */}
            <div className="mb-6 flex items-end justify-end">
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

            <ServiceFilters categoryId={category.id} onChange={(next) => setFilters((prev) => ({ ...prev, ...next }))} />

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
