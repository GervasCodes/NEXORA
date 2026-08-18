import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import ServiceGrid from "../components/ServiceGrid";
import ServiceFilters from "../components/ServiceFilters";
import MaintenanceScreen from "../components/MaintenanceScreen";
import PageMeta from "../components/PageMeta";

// Same rotating gradient fallback as ServiceCategoryCard.jsx/DepartmentCard.jsx,
// reused verbatim so a category without an admin-uploaded cover
// (AdminServiceCategories) still gets a polished, on-brand hero instead of a
// flat/empty one - and so the fallback here visually matches the same
// category's card back on ServicesBrowse.jsx.
const FALLBACK_GRADIENTS = [
    "linear-gradient(135deg, #1D4ED8 0%, #6EA8FE 100%)",
    "linear-gradient(135deg, #0F766E 0%, #2DD4BF 100%)",
    "linear-gradient(135deg, #C2410C 0%, #FB923C 100%)",
    "linear-gradient(135deg, #075985 0%, #38BDF8 100%)",
    "linear-gradient(135deg, #7C2D12 0%, #EA580C 100%)",
    "linear-gradient(135deg, #134E4A 0%, #14B8A6 100%)",
    "linear-gradient(135deg, #1E3A8A 0%, #9FC1F2 100%)"
];

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

    const gradient = FALLBACK_GRADIENTS[category.id % FALLBACK_GRADIENTS.length];

    return (
        <div className="animate-fade-in">
            <PageMeta title={category.name} description={category.description} image={category.cover_image_url} />

            {/* Premium visual category header, mirrors DepartmentPage.jsx's
                department hero (same abyss/frost treatment) so a service
                category feels as intentional as a product department. Falls
                back to the same rotating gradient as ServiceCategoryCard.jsx
                when the admin hasn't uploaded a cover yet, rather than a
                flat/empty hero. */}
            <div
                className="bg-abyss text-frost relative overflow-hidden bg-cover bg-center animate-slide-up"
                style={category.cover_image_url ? { backgroundImage: `url(${category.cover_image_url})` } : { background: gradient }}
            >
                <div className="absolute inset-0 bg-abyss/70" />
                {!category.cover_image_url && (
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        className="absolute -right-6 -bottom-6 w-40 h-40 text-frost/10"
                        aria-hidden="true"
                    >
                        <rect x="3" y="3" width="7" height="7" rx="1.5" />
                        <rect x="14" y="3" width="7" height="7" rx="1.5" />
                        <rect x="3" y="14" width="7" height="7" rx="1.5" />
                        <rect x="14" y="14" width="7" height="7" rx="1.5" />
                    </svg>
                )}
                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
                    <Link to="/services" className="text-frost/70 hover:text-frost text-xs">← All services</Link>
                    <h1 className="font-display text-3xl sm:text-4xl mt-2 mb-2">{category.name}</h1>
                    {category.description && (
                        <p className="text-frost/70 text-sm max-w-lg mb-2">{category.description}</p>
                    )}
                    <p className="text-frost/60 text-xs">
                        {category.serviceCount} {category.serviceCount === 1 ? "service" : "services"}
                    </p>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
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
        </div>
    );
}
