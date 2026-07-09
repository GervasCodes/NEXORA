import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import ProductCard from "../components/ProductCard";

export default function Home() {
    const [searchParams] = useSearchParams();
    const search = searchParams.get("search") || "";

    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [categoryId, setCategoryId] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        api.get("/categories").then(({ data }) => setCategories(data.data)).catch(() => {});
    }, []);

    useEffect(() => {
        setLoading(true);
        setError("");

        const params = { limit: 24 };
        if (search) params.search = search;
        if (categoryId) params.category_id = categoryId;

        api.get("/products", { params })
            .then(({ data }) => setProducts(data.data))
            .catch(() => setError("Couldn't load products right now."))
            .finally(() => setLoading(false));
    }, [search, categoryId]);

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

                {loading && <p className="text-ash">Loading products…</p>}
                {error && <p className="text-coral">{error}</p>}

                {!loading && !error && products.length === 0 && (
                    <div className="text-center py-24">
                        <p className="font-display text-xl mb-1">Nothing here yet</p>
                        <p className="text-ash text-sm">Try a different search or check back soon.</p>
                    </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                    {products.map((product) => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            </div>
        </div>
    );
}
