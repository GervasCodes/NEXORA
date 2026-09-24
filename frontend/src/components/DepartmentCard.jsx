import { Link } from "react-router-dom";
import CornerBadge from "./ui/CornerBadge";
import ImageOverlayCaption from "./ui/ImageOverlayCaption";

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

// Phase 4 (Real Imagery & Avatars) follow-up: four departments have a
// curated cover, sourced from verified/freely-licensed photos (all
// Unsplash License, all hotlinked from images.unsplash.com - Unsplash's
// own CDN, not a re-hosted copy):
//  - phones-electronics: "black smartphone" by Balázs Kétyi
//    (https://unsplash.com/photos/xIcr9ygfhIk)
//  - fashion-beauty: "assorted-colored clothes on rack near brown
//    wooden table" by S O C I A L . C U T
//    (https://unsplash.com/photos/7KkDiSs5UdQ)
//  - home-living: "a living room filled with furniture and a large
//    window" by Minh Pham (https://unsplash.com/photos/OtXADkUh3-I)
//  - groceries-food: "assorted vegetable lot" by Julian Hanslmaier
//    (https://unsplash.com/photos/bWg-BeVJPG4)
// "services" deliberately has no entry here - it's excluded from this
// department grid entirely (see Home.jsx's DepartmentDiscovery) and
// rendered as its own tile instead. A previous "services" entry here
// pointed at a Pinterest pin page rather than a real image file (round-3
// audit) and never rendered reliably; removed rather than fixed, since
// this map isn't read for that tile in the first place.
const CURATED_COVER_IMAGES = {
    "phones-electronics": "https://images.unsplash.com/photo-1545063328-c8e3faffa16f?q=80&w=1200&auto=format&fit=crop",
    "fashion-beauty": "https://images.unsplash.com/photo-1573612664822-d7d347da7b80?q=80&w=1200&auto=format&fit=crop",
    "home-living": "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?q=80&w=1200&auto=format&fit=crop",
    "groceries-food": "https://images.unsplash.com/photo-1458917524587-d3236cc8c2c8?q=80&w=1200&auto=format&fit=crop"
};

export default function DepartmentCard({ department, index }) {
    const gradient = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];
    const coverImage = department.cover_image_url || CURATED_COVER_IMAGES[department.slug];

    return (
        <Link
            to={`/departments/${department.slug}`}
            // Subtle staggered entrance (Phase 3: modernize the department
            // grid's visual treatment) - additive only, reuses the
            // existing "fade-in" keyframe/animation rather than adding a
            // second animation system. Doesn't touch DepartmentDiscovery's
            // data-fetching.
            style={{ animationDelay: `${Math.min(index, 9) * 40}ms` }}
            className="group block bg-paper border border-line rounded-xl overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all animate-fade-in"
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
                <ImageOverlayCaption
                    title={department.name}
                    subtitle={`${department.productCount} ${department.productCount === 1 ? "product" : "products"}`}
                />
                {department.is_sponsored ? (
                    <CornerBadge corner="top-right" shape="pill" tone="bg-mango text-abyss" label="Sponsored" />
                ) : department.newCount > 0 && (
                    <CornerBadge corner="top-right" shape="pill" tone="bg-teal text-frost" label={`${department.newCount} new`} />
                )}
            </div>
        </Link>
    );
}
