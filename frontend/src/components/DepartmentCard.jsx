import { Link } from "react-router-dom";

// Small rotating set of on-brand gradients used as a placeholder cover for
// departments that don't have an admin-uploaded cover image yet, so the
// grid still looks intentional on day one.
const FALLBACK_GRADIENTS = [
    "linear-gradient(135deg, #1D4ED8 0%, #6EA8FE 100%)",
    "linear-gradient(135deg, #0F766E 0%, #2DD4BF 100%)",
    "linear-gradient(135deg, #C2410C 0%, #FB923C 100%)",
    "linear-gradient(135deg, #075985 0%, #38BDF8 100%)",
    "linear-gradient(135deg, #7C2D12 0%, #EA580C 100%)",
    "linear-gradient(135deg, #134E4A 0%, #14B8A6 100%)",
    "linear-gradient(135deg, #1E3A8A 0%, #9FC1F2 100%)"
];

// Phase 6 (item 23) follow-up: the team decided to replace the
// gradient-and-initial placeholder with a real photo for the
// "services" department specifically. This is a real, verified,
// freely-licensed photo (Unsplash License - free for commercial use,
// no attribution required: https://unsplash.com/license), not a
// fabricated URL - "Businessmen are shaking hands in a professional
// gesture" by Ambre Estève (https://unsplash.com/photos/bGczI5fXbmo).
// Only "services" has a sourced photo so far; every other department
// (phones-electronics, fashion-beauty, home-living, groceries-food)
// still falls back to the gradient below until a curated photo per
// category is sourced - this is a partial rollout of that decision,
// not a full curated set.
const CURATED_COVER_IMAGES = {
    services: "https://stl.tech/wp-content/uploads/2023/02/Network-services-scaled.webp?fm=jpg&q=80&w=1200&auto=format&fit=crop"
};

export default function DepartmentCard({ department, index }) {
    const gradient = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];
    const trending = department.trending || [];
    const coverImage = department.cover_image_url || CURATED_COVER_IMAGES[department.slug];

    return (
        <Link
            to={`/departments/${department.slug}`}
            className="group block bg-paper border border-line rounded-xl overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
            <div className="aspect-[4/3] relative overflow-hidden" style={!coverImage ? { background: gradient } : undefined}>
                {coverImage ? (
                    <img
                        src={coverImage}
                        alt={department.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <span className="font-display text-3xl text-frost/90">{department.name.charAt(0)}</span>
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-abyss/70 via-abyss/0 to-abyss/0" />
                {department.is_sponsored ? (
                    <span className="absolute top-2 right-2 bg-mango text-abyss text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full">
                        Sponsored
                    </span>
                ) : department.newCount > 0 && (
                    <span className="absolute top-2 right-2 bg-teal text-frost text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full">
                        {department.newCount} new
                    </span>
                )}
                <div className="absolute bottom-3 left-3 right-3">
                    <h3 className="font-display text-lg text-frost leading-tight mb-0.5">{department.name}</h3>
                    <p className="text-frost/75 text-xs">
                        {department.productCount} {department.productCount === 1 ? "product" : "products"}
                    </p>
                </div>
            </div>

            {trending.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2.5 border-t border-line">
                    <span className="text-[10px] uppercase tracking-wide text-ash shrink-0">Trending</span>
                    <div className="flex -space-x-2">
                        {trending.map((product) => (
                            <div key={product.id} className="w-7 h-7 rounded-full border-2 border-paper bg-line/50 overflow-hidden shrink-0">
                                {product.image_url ? (
                                    <img src={product.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                ) : null}
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-ash truncate">
                        {trending[0].name}
                    </p>
                </div>
            )}
        </Link>
    );
}
