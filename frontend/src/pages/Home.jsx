import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import api from "../api/client";
import DepartmentCard from "../components/DepartmentCard";
import ProductGrid from "../components/ProductGrid";
import ProductFilters from "../components/ProductFilters";
import { useLanguage } from "../context/LanguageContext";

function DepartmentCardSkeleton() {
    return (
        <div className="animate-pulse">
            <div className="aspect-[4/3] bg-line/50 rounded-xl" />
        </div>
    );
}

// Homepage department-discovery grid. Shown when there's no search - the
// default landing view. Each card links to its own /departments/:slug
// page (see Phase 2A's DepartmentPage).
function DepartmentDiscovery() {
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        api.get("/categories/departments")
            .then(({ data }) => setDepartments(data.data))
            .catch(() => setError("Couldn't load departments right now."))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
                {Array.from({ length: 7 }).map((_, i) => <DepartmentCardSkeleton key={i} />)}
            </div>
        );
    }

    if (error) return <p className="text-coral">{error}</p>;

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
            {departments.map((department, i) => (
                <DepartmentCard key={department.id} department={department} index={i} />
            ))}
        </div>
    );
}

export default function Home() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const search = searchParams.get("search") || "";
    const [resultCount, setResultCount] = useState(null);
    const [filters, setFilters] = useState({});

    // Reset the count and any active filters whenever the search term
    // itself changes, so a previous term's count/filters never carry
    // over while the new one is loading.
    useEffect(() => {
        setResultCount(null);
        setFilters({});
    }, [search]);

    return (
        <div>
            {!search && (
                <div className="bg-abyss text-paper relative overflow-hidden">
                    <div
                        className="absolute inset-0 opacity-40"
                        style={{
                            background: "radial-gradient(60% 100% at 15% 0%, rgba(110,168,254,0.35) 0%, rgba(7,9,18,0) 60%), radial-gradient(50% 90% at 100% 100%, rgba(29,78,216,0.35) 0%, rgba(7,9,18,0) 60%)"
                        }}
                    />
                    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
                        <p className="text-azure-light text-xs uppercase tracking-[0.2em] mb-3">The regional marketplace</p>
                        <h1 className="font-display text-4xl sm:text-5xl max-w-xl leading-tight mb-4">
                            Everything you need, from sellers you trust.
                        </h1>
                        <p className="text-paper/60 max-w-md text-sm sm:text-base mb-8 sm:mb-10">
                            Shop thousands of products from local vendors, with delivery tracked door to door.
                        </p>

                        <div className="flex flex-wrap gap-x-8 gap-y-3">
                            {[
                                { label: "Verified sellers", icon: "M12 2 4 5v6c0 5.5 3.4 9.7 8 11 4.6-1.3 8-5.5 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 5.1-5.1 1.4 1.4-6.5 6.5Z" },
                                { label: "Delivery tracked door to door", icon: "M3 3h11v10H3zM14 8h4l3 3v2h-7zM6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" },
                                { label: "Local vendors, regional reach", icon: "M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Zm0-9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" }
                            ].map((item) => (
                                <div key={item.label} className="flex items-center gap-2 text-paper/70 text-xs sm:text-sm">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4 text-azure-light shrink-0">
                                        <path d={item.icon} />
                                    </svg>
                                    {item.label}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
                {!search && (
                    <>
                        <div className="mb-6">
                            <h2 className="font-display text-2xl mb-1">Shop by department</h2>
                            <p className="text-ash text-sm">Browse everything on NEXORA, organized the way you shop.</p>
                        </div>
                        <DepartmentDiscovery />

                        <div className="text-center mt-8">
                            <Link to="/products" className="text-sm text-teal hover:underline">
                                Or browse every product →
                            </Link>
                        </div>
                    </>
                )}

                {search && (
                    <>
                        <div className="mb-8 flex items-end justify-between flex-wrap gap-2">
                            <div>
                                <p className="text-xs uppercase tracking-widest text-ash mb-1">
                                    {t("search.resultsFor", { term: search })}
                                </p>
                                <h1 className="font-display text-3xl">Search results</h1>
                                {resultCount !== null && (
                                    <p className="text-ash text-sm mt-1">
                                        {resultCount === 1 ? t("search.resultCountOne") : t("search.resultCountMany", { count: resultCount })}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => navigate("/")}
                                className="text-sm text-teal hover:underline shrink-0"
                            >
                                {t("search.clearSearch")}
                            </button>
                        </div>

                        <ProductFilters onChange={setFilters} />

                        <ProductGrid
                            params={{ search, ...filters }}
                            onResults={setResultCount}
                            emptyTitle={t("search.noResultsTitle", { term: search })}
                            emptyHint={t("search.noResultsHint")}
                            emptyAction={
                                <div className="flex items-center justify-center gap-4 mt-4">
                                    <Link to="/" className="text-sm text-teal hover:underline">
                                        {t("search.browseDepartments")}
                                    </Link>
                                    <Link to="/products" className="text-sm text-teal hover:underline">
                                        {t("search.browseAll")}
                                    </Link>
                                </div>
                            }
                        />
                    </>
                )}
            </div>
        </div>
    );
}
