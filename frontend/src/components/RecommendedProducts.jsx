import { useEffect, useState } from "react";
import api from "../api/client";
import ProductCard from "./ProductCard";

// One reusable horizontal shelf, fed by either recommendation endpoint -
// `endpoint` is the full request path so this component stays agnostic
// about which rules-based ranking produced the list (see
// recommendation.service.js for how each is scored).
export default function RecommendedProducts({ endpoint, title }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        api.get(endpoint)
            .then(({ data }) => { if (!cancelled) setProducts(data.data || []); })
            .catch(() => { if (!cancelled) setProducts([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [endpoint]);

    if (!loading && products.length === 0) return null;

    return (
        <section className="my-10">
            <h2 className="font-display text-xl mb-4">{title}</h2>
            {loading ? (
                <div className="flex gap-4 overflow-x-hidden">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="w-44 shrink-0 h-56 bg-line/40 rounded-lg animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                    {products.map((product) => (
                        <div key={product.id} className="w-44 shrink-0 snap-start">
                            <ProductCard product={product} />
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
