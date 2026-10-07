import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import api from "../api/client";
import ServiceGrid from "../components/ServiceGrid";
import ServiceFilters from "../components/ServiceFilters";
import MaintenanceScreen from "../components/MaintenanceScreen";
import PageMeta from "../components/PageMeta";
import Breadcrumbs from "../components/ui/Breadcrumbs";
import SeoPagination from "../components/SeoPagination";
import { logSearchMiss } from "../utils/seoMetrics";
import { useLanguage } from "../context/LanguageContext";
import { buildBreadcrumbJsonLd, buildCollectionJsonLd, clipDescription, readPageParam } from "../utils/seo";

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
    const { t } = useLanguage();
    const [searchParams] = useSearchParams();
    const page = readPageParam(searchParams);
    const [totalPages, setTotalPages] = useState(1);
    const [category, setCategory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [maintenance, setMaintenance] = useState(null);
    const [filters, setFilters] = useState({});
    const [search, setSearch] = useState("");
    const [resultCount, setResultCount] = useState(null);

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
                title={maintenance.name ? t("services.maintenanceNamed", { name: maintenance.name }) : t("services.maintenance")}
                message={maintenance.message}
                onRetry={loadCategory}
            />
        );
    }

    if (error || !category) {
        return (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-24 text-center">
                <PageMeta title={t("services.notFound")} noIndex />
                <p className="font-display text-xl mb-2">{error || "Service category not found"}</p>
                <Link to="/services" className="text-sm text-teal hover:underline">← Back to all services</Link>
            </div>
        );
    }

    const gradient = FALLBACK_GRADIENTS[category.id % FALLBACK_GRADIENTS.length];

    const introDescription = category.description
        ? clipDescription(category.description)
        : t("seo.serviceCategory.description", { name: category.name });
    const listingPath = `/services/category/${category.slug || slug}`;
    const breadcrumbItems = [
        { label: t("nav.home"), href: "/" },
        { label: t("seo.services"), href: "/services" },
        { label: category.name }
    ];

    return (
        <div className="animate-fade-in">
            <PageMeta
                title={page > 1 ? t("seo.pageTitle", { title: category.name, page }) : category.name}
                description={introDescription}
                image={category.cover_image_url}
                keepParams={["page"]}
                jsonLd={[
                    buildCollectionJsonLd({ name: category.name, description: introDescription, path: listingPath }),
                    buildBreadcrumbJsonLd(breadcrumbItems, listingPath)
                ]}
            />

            {/* Premium visual category header, mirrors DepartmentPage.jsx's
                department hero (same abyss/frost treatment) so a service
                category feels as intentional as a product department. Falls
                back to the same rotating gradient as ServiceCategoryCard.jsx
                when the admin hasn't uploaded a cover yet, rather than a
                flat/empty hero. */}
            <div
                className="bg-abyss text-frost relative overflow-hidden animate-slide-up"
                style={category.cover_image_url ? undefined : { background: gradient }}
            >
                {category.cover_image_url && (
                    <img
                        src={category.cover_image_url}
                        alt=""
                        width={1600}
                        height={600}
                        sizes="100vw"
                        fetchPriority="high"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                )}
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
                    <Link to="/services" className="text-frost/70 hover:text-frost text-xs">{t("services.backToAll")}</Link>
                    <h1 className="font-display text-3xl sm:text-4xl mt-2 mb-2">{category.name}</h1>
                    {category.description && (
                        <p className="text-frost/70 text-sm max-w-lg mb-2">{category.description}</p>
                    )}
                    <p className="text-frost/60 text-xs">
                        {category.serviceCount === 1
                            ? t("services.countOne")
                            : t("services.countMany", { count: category.serviceCount })}
                    </p>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
                <Breadcrumbs items={breadcrumbItems} />
                <p className="text-sm text-ash max-w-3xl mb-6">
                    {t("seo.serviceCategory.intro", { name: category.name, count: category.serviceCount })}
                </p>
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
                            placeholder={t("services.searchPlaceholder", { name: category.name })}
                            className="flex-1 h-11 border border-line rounded-md px-3 text-base focus-ring"
                        />
                        <button type="submit" className="h-11 text-sm border border-line px-4 rounded-md hover:border-ink transition-colors shrink-0">
                            {t("services.searchSubmit")}
                        </button>
                    </form>
                </div>

                {resultCount !== null && (
                    <p className="text-ash text-sm mb-4">
                        {resultCount === 1 ? t("search.resultCountOne") : t("search.resultCountMany", { count: resultCount })}
                    </p>
                )}

                <ServiceFilters categoryId={category.id} onChange={(next) => setFilters((prev) => ({ ...prev, ...next }))} />

                <ServiceGrid
                    params={{ category_id: category.id, ...filters }}
                    startPage={page}
                    onResults={(total, pages) => {
                        setTotalPages(pages);
                        setResultCount(total);
                        if (total === 0 && filters.search) logSearchMiss(filters.search, "services");
                    }}
                    emptyTitle={t("services.emptyTitle", { name: category.name })}
                    emptyHint={t("services.emptyHint")}
                    emptyAction={
                        <p className="mt-4 text-sm">
                            <Link to="/services" className="text-teal hover:underline">{t("services.browseAllInstead")}</Link>
                        </p>
                    }
                />
                <SeoPagination page={page} totalPages={totalPages} />
            </div>
        </div>
    );
}
