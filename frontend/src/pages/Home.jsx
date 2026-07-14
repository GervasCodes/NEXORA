import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import ProductCard from "../components/ProductCard";

const PAGE_SIZE = 24;

function ProductCardSkeleton() {
    return (
        <div className="animate-pulse">
            <div className="aspect-square bg-line/50 rounded-md mb-3" />
            <div className="h-2.5 w-2/3 bg-line/50 rounded mb-2" />
            <div className="h-3.5 w-full bg-line/50 rounded mb-2" />
            <div className="h-3.5 w-1/3 bg-line/50 rounded" />
        </div>
    );
}

export default function Home() {
    const [searchParams] = useSearchParams();
    const search = searchParams.get("search") || "";

    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [categoryId, setCategoryId] = useState("");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const sentinelRef = useRef(null);

    useEffect(() => {
        api.get("/categories").then(({ data }) => setCategories(data.data)).catch(() => {});
    }, []);

    // Fresh search/category -> reset to page 1 and replace the list.
    useEffect(() => {
        setLoading(true);
        setError("");
        setPage(1);

        const params = { limit: PAGE_SIZE, page: 1 };
        if (search) params.search = search;
        if (categoryId) params.category_id = categoryId;

        api.get("/products", { params })
            .then(({ data }) => {
                setProducts(data.data);
                setTotalPages(data.pagination?.totalPages || 1);
            })
            .catch(() => setError("Couldn't load products right now."))
            .finally(() => setLoading(false));
    }, [search, categoryId]);

    // Infinite scroll: append the next page when the sentinel at the
    // bottom of the grid comes into view. Replaces the old fixed-limit
    // load (24 products, no way to see more) with real pagination that
    // was already supported server-side but never wired up.
    const loadMore = useCallback(() => {
        if (loading || loadingMore || page >= totalPages) return;

        const nextPage = page + 1;
        setLoadingMore(true);

        const params = { limit: PAGE_SIZE, page: nextPage };
        if (search) params.search = search;
        if (categoryId) params.category_id = categoryId;

        api.get("/products", { params })
            .then(({ data }) => {
                setProducts((prev) => [...prev, ...data.data]);
                setPage(nextPage);
            })
            .catch(() => {})
            .finally(() => setLoadingMore(false));
    }, [loading, loadingMore, page, totalPages, search, categoryId]);

    useEffect(() => {
        const node = sentinelRef.current;
        if (!node) return;

        const observer = new IntersectionObserver(
            (entries) => { if (entries[0].isIntersecting) loadMore(); },
            { rootMargin: "400px" }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [loadMore]);

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
                        <p className="text-paper/60 max-w-md text-sm sm:text-base">
                            Shop thousands of products from local vendors, with delivery tracked door to door.
                        </p>
                    </div>
                </div>
            )}

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
                {search && (
                    <div className="mb-8">
                        <p className="text-xs uppercase tracking-widest text-ash mb-1">Results for "{search}"</p>
                        <h1 className="font-display text-3xl">Search results</h1>
                    </div>
                )}

                {categories.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-8">
                        <button
                            onClick={() => setCategoryId("")}
                            className={`text-sm px-3 py-1.5 rounded-full border transition-colors focus-ring ${
                                categoryId === "" ? "bg-abyss text-paper border-abyss" : "border-line hover:border-abyss"
                            }`}
                        >
                            All
                        </button>
                        {categories.map((c) => (
                            <button
                                key={c.id}
                                onClick={() => setCategoryId(c.id)}
                                className={`text-sm px-3 py-1.5 rounded-full border transition-colors focus-ring ${
                                    categoryId === c.id ? "bg-abyss text-paper border-abyss" : "border-line hover:border-abyss"
                                }`}
                            >
                                {c.name}
                            </button>
                        ))}
                    </div>
                )}

                {error && <p className="text-coral">{error}</p>}

                {loading && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                        {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
                    </div>
                )}

                {!loading && !error && products.length === 0 && (
                    <div className="text-center py-24">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-line/40 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-ash">
                                <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                            </svg>
                        </div>
                        <p className="font-display text-xl mb-1">
                            {search ? `No results for "${search}"` : "Nothing here yet"}
                        </p>
                        <p className="text-ash text-sm">
                            {search ? "Try a different search term or browse a category instead." : "Try a different search or check back soon."}
                        </p>
                    </div>
                )}

                {!loading && !error && products.length > 0 && (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                            {products.map((product) => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </div>

                        {/* Sentinel for infinite scroll, plus a manual fallback for
                            anyone whose browser/extensions block IntersectionObserver. */}
                        <div ref={sentinelRef} />
                        {loadingMore && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 mt-4 sm:mt-5">
                                {Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
                            </div>
                        )}
                        {!loadingMore && page < totalPages && (
                            <div className="text-center mt-8">
                                <button
                                    onClick={loadMore}
                                    className="text-sm border border-line px-5 py-2 rounded-full hover:border-ink transition-colors"
                                >
                                    Load more
                                </button>
                            </div>
                        )}
                        {page >= totalPages && products.length >= PAGE_SIZE && (
                            <p className="text-center text-ash text-xs mt-8">You've reached the end.</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
