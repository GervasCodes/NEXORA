import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import api from "../api/client";
import ProductGrid from "../components/ProductGrid";
import { feedLink } from "../utils/feedLink";
import PageMeta from "../components/PageMeta";
import ProductRow from "../components/ProductRow";
import FeaturedStoreCard from "../components/FeaturedStoreCard";
import ProductFilters from "../components/ProductFilters";
import MaintenanceScreen from "../components/MaintenanceScreen";
import ServicesBrowse from "./ServicesBrowse";
import { useSocket } from "../context/SocketContext";
import { ServicesIcon } from "../components/NavIcons";
import Breadcrumbs from "../components/ui/Breadcrumbs";
import SeoPagination from "../components/SeoPagination";
import { useLanguage } from "../context/LanguageContext";
import { buildBreadcrumbJsonLd, buildCollectionJsonLd, clipDescription, readPageParam } from "../utils/seo";

// The "Services" department card lives in the same homepage grid as every
// product department, but services aren't products - they have their own
// browsing UI (categories, availability, bookings) already built in
// ServicesBrowse.jsx. So this route special-cases that one slug and
// renders the real services experience instead of the product grid below,
// rather than calling the product-department API for it.
const SERVICES_DEPARTMENT_SLUG = "services";

// Flow: Homepage -> Department -> Products.
export default function DepartmentPage() {
    const { slug } = useParams();
    const { t } = useLanguage();
    const [searchParams] = useSearchParams();
    const page = readPageParam(searchParams);
    const [totalPages, setTotalPages] = useState(1);
    const [guides, setGuides] = useState([]);
    const [department, setDepartment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [maintenance, setMaintenance] = useState(null);
    const [filters, setFilters] = useState({});
    const [query, setQuery] = useState("");
    const [submittedQuery, setSubmittedQuery] = useState("");
    const [resultCount, setResultCount] = useState(null);

    const loadDepartment = () => {
        setLoading(true);
        setError("");
        setMaintenance(null);
        setFilters({});

        api.get(`/categories/departments/${slug}`)
            .then(({ data }) => setDepartment(data.data))
            .catch((err) => {
                if (err.response?.data?.code === "DEPARTMENT_MAINTENANCE") {
                    setMaintenance({
                        name: err.response.data.data?.name,
                        message: err.response.data.message,
                        estimatedReturn: err.response.data.data?.estimatedReturn
                    });
                } else if (err.response?.status === 404) {
                    setError("This department couldn't be found.");
                } else {
                    setError("Couldn't load this department right now.");
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (slug === SERVICES_DEPARTMENT_SLUG) {
            setLoading(false);
            return;
        }

        loadDepartment();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug]);

    // Related buying guides (internal linking department -> guides). The
    // guides list is already filterable by department id.
    useEffect(() => {
        if (!department?.id) {
            setGuides([]);
            return;
        }
        api.get("/content", { params: { category_id: department.id, limit: 3 } })
            .then(({ data }) => setGuides(data.data || []))
            .catch(() => setGuides([]));
    }, [department?.id]);

    // If this exact department's maintenance state changes while the
    // shopper is already looking at it, react live instead of waiting for
    // a manual refresh - DepartmentMaintenanceListener.jsx handles the
    // toast for everyone else; this only concerns the page currently open.
    // (Only fires for logged-in shoppers - SocketContext only connects an
    // authenticated socket; a guest browsing this page still gets the
    // correct state on their next request via the REST call above.)
    const { socket } = useSocket();
    useEffect(() => {
        if (!socket || slug === SERVICES_DEPARTMENT_SLUG) return undefined;

        const handleMaintenanceChange = (payload) => {
            if (payload.slug !== slug) return;

            if (payload.status === "entered") {
                setMaintenance({ name: payload.name, message: payload.message, estimatedReturn: null });
            } else {
                // "exited" (reactivated) or "deactivated" - either way the
                // page's own GET call is the source of truth: reactivated
                // loads normally, deactivated now correctly 404s (hidden
                // completely) instead of showing a maintenance page.
                loadDepartment();
            }
        };

        socket.on("department:maintenance", handleMaintenanceChange);
        return () => socket.off("department:maintenance", handleMaintenanceChange);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, slug]);

    if (slug === SERVICES_DEPARTMENT_SLUG) {
        return <ServicesBrowse />;
    }

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
                title={maintenance.name ? t("department.maintenanceNamed", { name: maintenance.name }) : t("department.maintenance")}
                message={maintenance.message}
                estimatedReturn={maintenance.estimatedReturn}
                onRetry={loadDepartment}
            />
        );
    }

    if (error || !department) {
        return (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-24 text-center">
                <PageMeta title={t("department.notFound")} noIndex />
                <p className="font-display text-xl mb-2">{error || "Department not found"}</p>
                <Link to="/" className="text-sm text-teal hover:underline">← Back to all departments</Link>
            </div>
        );
    }

    const introDescription = department.description
        ? clipDescription(department.description)
        : t("seo.department.description", { name: department.name });
    const breadcrumbItems = [
        { label: t("nav.home"), href: "/" },
        { label: department.name }
    ];
    const listingPath = `/departments/${department.slug || slug}`;
    const itemList = [...(department.recent || []), ...(department.trending || [])]
        .filter((product, index, all) => product?.slug && all.findIndex((p) => p.slug === product.slug) === index)
        .slice(0, 12)
        .map((product) => ({ name: product.name, path: `/products/${product.slug}` }));

    return (
        <div>
            <PageMeta
                title={page > 1 ? t("seo.pageTitle", { title: department.name, page }) : department.name}
                description={introDescription}
                image={department.cover_image_url}
                keepParams={["page"]}
                jsonLd={[
                    buildCollectionJsonLd({ name: department.name, description: introDescription, path: listingPath, items: itemList }),
                    buildBreadcrumbJsonLd(breadcrumbItems, listingPath)
                ]}
            />
            <div className="bg-abyss text-frost relative overflow-hidden">
                {department.cover_image_url && (
                    <img
                        src={department.cover_image_url}
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
                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
                    <Link to="/" className="text-frost/70 hover:text-frost text-xs">{t("department.backToAll")}</Link>
                    <h1 className="font-display text-3xl sm:text-4xl mt-2 mb-2">{department.name}</h1>
                    {department.description && (
                        <p className="text-frost/70 text-sm max-w-lg mb-2">{department.description}</p>
                    )}
                    <p className="text-frost/60 text-xs">
                        {department.productCount === 1
                            ? t("department.productCountOne")
                            : t("department.productCountMany", { count: department.productCount })}
                        {department.newCount > 0 ? ` · ${t("department.newThisWeek", { count: department.newCount })}` : ""}
                    </p>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
                <Breadcrumbs items={breadcrumbItems} />
                {/* Real intro copy for crawlers and shoppers (not just a title and a grid). */}
                <p className="text-sm text-ash max-w-3xl mb-8">
                    {t("seo.department.intro", { name: department.name, count: department.productCount })}
                </p>
                {/* Phase 3: per-department cross-link to Services, styled
                    consistently with the homepage's own "Looking for a
                    service, not a product?" card (see Home.jsx) but sized
                    down to sit alongside this page's other rows instead of
                    as a standalone hero-sized block. */}
                <Link
                    to="/services"
                    className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-line/60 bg-azure/5 hover:bg-azure/10 transition-colors px-5 py-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-azure/15 flex items-center justify-center shrink-0">
                            <ServicesIcon className="w-4 h-4 text-azure" />
                        </div>
                        <p className="text-sm text-ink/80">{t("department.servicesCta")}</p>
                    </div>
                    <span className="text-sm text-teal shrink-0 hidden sm:inline">{t("department.browseServices")}</span>
                </Link>

                <ProductRow title={t("department.onSale")} products={department.promotions} />
                <ProductRow title={t("department.sponsored")} products={department.sponsored} />
                <ProductRow title={t("department.trendingIn", { name: department.name })} products={department.trending} />
                <ProductRow title={t("department.recentlyAdded")} products={department.recent} />

                {department.featuredStores?.length > 0 && (
                    <div className="mb-10">
                        <h2 className="font-display text-xl mb-4">{t("department.featuredStores")}</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {department.featuredStores.map((store) => (
                                <FeaturedStoreCard key={store.user_id} store={store} />
                            ))}
                        </div>
                    </div>
                )}

                <h2 className="font-display text-xl mb-4">{t("department.allProducts")}</h2>
                <div className="flex justify-end mb-3">
                    <Link
                        to={feedLink({ category_id: department.id, ...filters })}
                        className="text-sm border border-line px-4 py-2 rounded-full hover:border-ink transition-colors"
                    >
                        {t("products.shopFeed")}
                    </Link>
                </div>
                {/* In-page search, scoped to this department (searches its products only). */}
                <form
                    onSubmit={(e) => { e.preventDefault(); setSubmittedQuery(query.trim()); }}
                    className="mb-4 flex gap-2 w-full sm:max-w-md"
                >
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("department.searchPlaceholder", { name: department.name })}
                        className="flex-1 h-11 border border-line rounded-md px-3 text-base bg-paper focus:outline-none focus:border-ink"
                    />
                    <button type="submit" className="h-11 text-sm border border-line px-4 rounded-md hover:border-ink transition-colors shrink-0">
                        {t("department.searchSubmit")}
                    </button>
                </form>
                {resultCount !== null && (
                    <p className="text-ash text-sm mb-4">
                        {resultCount === 1 ? t("search.resultCountOne") : t("search.resultCountMany", { count: resultCount })}
                    </p>
                )}
                <ProductFilters categoryId={department.id} onChange={setFilters} />
                <ProductGrid
                    params={{ category_id: department.id, ...filters, ...(submittedQuery ? { search: submittedQuery } : {}) }}
                    startPage={page}
                    onResults={(total, pages) => { setTotalPages(pages); setResultCount(total); }}
                    emptyTitle={t("department.emptyTitle")}
                    emptyHint={t("department.emptyHint")}
                />
                <SeoPagination page={page} totalPages={totalPages} />

                {guides.length > 0 && (
                    <div className="mt-12 pt-8 border-t border-line">
                        <h2 className="font-display text-xl mb-4">{t("seo.department.guides", { name: department.name })}</h2>
                        <ul className="grid sm:grid-cols-3 gap-4">
                            {guides.map((guide) => (
                                <li key={guide.id}>
                                    <Link to={`/guides/${guide.slug}`} className="text-sm font-medium text-teal hover:underline">
                                        {guide.title}
                                    </Link>
                                    {guide.excerpt && <p className="text-xs text-ash mt-1 line-clamp-2">{guide.excerpt}</p>}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
