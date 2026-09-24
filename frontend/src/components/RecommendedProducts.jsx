import { useEffect, useState } from "react";
import api from "../api/client";
import { explainRecommendations } from "../api/ai";
import ProductCard from "./ProductCard";

// endpoint -> the AI-explain context it maps to (see ai.controller.js's
// explainRecommendations - "for-me" is the personal feed, anything else
// is a product slug for the "related to this product" shelf).
const deriveAiContext = (endpoint) => {
    if (endpoint === "/recommendations/for-me") return "for-me";
    const match = endpoint.match(/^\/recommendations\/related\/(.+)$/);
    return match ? match[1] : null;
};

// One reusable horizontal shelf, fed by either recommendation endpoint -
// `endpoint` is the full request path so this component stays agnostic
// about which rules-based ranking produced the list (see
// recommendation.service.js for how each is scored). Phase B1: also
// fetches a one-line "why" per product from Nexora AI - ranking itself
// never changes, this only adds phrasing on top, and silently renders
// without it if that call fails or doesn't line up.
export default function RecommendedProducts({ endpoint, title }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [whyById, setWhyById] = useState({});

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setWhyById({});
        api.get(endpoint)
            .then(({ data }) => { if (!cancelled) setProducts(data.data || []); })
            .catch(() => { if (!cancelled) setProducts([]); })
            .finally(() => { if (!cancelled) setLoading(false); });

        const aiContext = deriveAiContext(endpoint);
        if (aiContext) {
            explainRecommendations(aiContext)
                .then((result) => {
                    if (cancelled) return;
                    const map = {};
                    (result.products || []).forEach((p) => { map[p.id] = p.why; });
                    setWhyById(map);
                })
                // AI phrasing is purely additive - a failed/slow call just
                // means no "why" line shows, never an error the shopper sees.
                .catch(() => {});
        }
        return () => { cancelled = true; };
    }, [endpoint]);

    if (!loading && products.length === 0) return null;

    // Phase 3: vertical grid instead of a horizontal snap-scroll shelf -
    // same grid-cols breakpoints ProductGrid.jsx already uses, so this
    // reads as a continuation of the page's normal product grid rather
    // than a visually distinct shelf. Skeleton count/shape follows suit
    // (8 tiles across the grid instead of 4 tiles sized for a single row).
    return (
        <section className="my-10">
            <h2 className="font-display text-xl mb-4">{title}</h2>
            {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-56 bg-line/40 rounded-lg animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                    {products.map((product) => (
                        <div key={product.id}>
                            <ProductCard product={product} />
                            {whyById[product.id] && (
                                <p className="text-[11px] text-ash mt-1 px-0.5 line-clamp-1">{whyById[product.id]}</p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
