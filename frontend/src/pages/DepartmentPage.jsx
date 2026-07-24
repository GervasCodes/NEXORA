import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import ProductGrid from "../components/ProductGrid";
import ProductRow from "../components/ProductRow";
import FeaturedStoreCard from "../components/FeaturedStoreCard";
import ProductFilters from "../components/ProductFilters";

// Flow: Homepage -> Department -> Products.
export default function DepartmentPage() {
    const { slug } = useParams();
    const [department, setDepartment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [filters, setFilters] = useState({});

    useEffect(() => {
        setLoading(true);
        setError("");
        setFilters({});

        api.get(`/categories/departments/${slug}`)
            .then(({ data }) => setDepartment(data.data))
            .catch((err) => {
                if (err.response?.status === 404) {
                    setError("This department couldn't be found.");
                } else {
                    setError("Couldn't load this department right now.");
                }
            })
            .finally(() => setLoading(false));
    }, [slug]);

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
                <div className="animate-pulse h-40 bg-line/40 rounded-xl mb-8" />
            </div>
        );
    }

    if (error || !department) {
        return (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-24 text-center">
                <p className="font-display text-xl mb-2">{error || "Department not found"}</p>
                <Link to="/" className="text-sm text-teal hover:underline">← Back to all departments</Link>
            </div>
        );
    }

    return (
        <div>
            <div
                className="bg-abyss text-paper relative overflow-hidden bg-cover bg-center"
                style={department.cover_image_url ? { backgroundImage: `url(${department.cover_image_url})` } : undefined}
            >
                <div className="absolute inset-0 bg-abyss/70" />
                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
                    <Link to="/" className="text-paper/70 hover:text-paper text-xs">← All departments</Link>
                    <h1 className="font-display text-3xl sm:text-4xl mt-2 mb-2">{department.name}</h1>
                    {department.description && (
                        <p className="text-paper/70 text-sm max-w-lg mb-2">{department.description}</p>
                    )}
                    <p className="text-paper/60 text-xs">
                        {department.productCount} {department.productCount === 1 ? "product" : "products"}
                        {department.newCount > 0 ? ` · ${department.newCount} new this week` : ""}
                    </p>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
                <ProductRow title="On sale" products={department.promotions} />
                <ProductRow title="Sponsored" products={department.sponsored} />
                <ProductRow title={`Trending in ${department.name}`} products={department.trending} />
                <ProductRow title="Recently added" products={department.recent} />

                {department.featuredStores?.length > 0 && (
                    <div className="mb-10">
                        <h2 className="font-display text-xl mb-4">Featured stores</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {department.featuredStores.map((store) => (
                                <FeaturedStoreCard key={store.user_id} store={store} />
                            ))}
                        </div>
                    </div>
                )}

                <h2 className="font-display text-xl mb-4">All products</h2>
                <ProductFilters categoryId={department.id} onChange={setFilters} />
                <ProductGrid
                    params={{ category_id: department.id, ...filters }}
                    emptyTitle="Nothing here yet"
                    emptyHint="This department doesn't have any products yet - check back soon."
                />
            </div>
        </div>
    );
}
