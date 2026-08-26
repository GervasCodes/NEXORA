import { Link } from "react-router-dom";

// Same rotating gradient fallback as DepartmentCard.jsx, reused verbatim
// so a category without an admin-uploaded cover (AdminServiceCategories)
// looks just as intentional as a product department does on day one.
const FALLBACK_GRADIENTS = [
    "linear-gradient(135deg, #1D4ED8 0%, #6EA8FE 100%)",
    "linear-gradient(135deg, #0F766E 0%, #2DD4BF 100%)",
    "linear-gradient(135deg, #C2410C 0%, #FB923C 100%)",
    "linear-gradient(135deg, #075985 0%, #38BDF8 100%)",
    "linear-gradient(135deg, #7C2D12 0%, #EA580C 100%)",
    "linear-gradient(135deg, #134E4A 0%, #14B8A6 100%)",
    "linear-gradient(135deg, #1E3A8A 0%, #9FC1F2 100%)"
];

// category is null/undefined for the "All services" tile - it sits in the
// same grid as every real category (ServicesBrowse.jsx / ServiceCategoryPage.jsx
// pass it first) and links back to the /services hub, the same way each real
// category card links to its own dedicated /services/category/:slug page
// (mirrors DepartmentCard.jsx linking to /departments/:slug). `active` just
// highlights whichever card matches the page currently being viewed.
//
// Phase 6 (item 23) follow-up: same curated-photo decision as
// DepartmentCard.jsx, applied to the "All services" tile specifically
// since it represents services in general (the individual categories -
// accommodation, transportation, tourism, etc. - don't have a sourced
// photo yet and keep the dark gradient + grid icon below).
const ALL_SERVICES_COVER_IMAGE = "https://stl.tech/wp-content/uploads/2023/02/Network-services-scaled.webp?fm=jpg&q=80&w=1200&auto=format&fit=crop";

export default function ServiceCategoryCard({ category, index, active, totalCount }) {
    const isAll = !category;
    const gradient = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];
    const name = isAll ? "All services" : category.name;
    const count = isAll ? totalCount : category.serviceCount;
    const to = isAll ? "/services" : `/services/category/${category.slug}`;

    return (
        <Link
            to={to}
            aria-current={active ? "page" : undefined}
            className={`group block bg-paper border rounded-xl overflow-hidden transition-all ${
                active ? "border-ink shadow-md" : "border-line hover:border-ink hover:shadow-md hover:-translate-y-0.5"
            }`}
        >
            <div
                className="aspect-[4/3] relative overflow-hidden"
                style={!isAll && !category.cover_image_url ? { background: gradient } : undefined}
            >
                {isAll ? (
                    <img
                        src={ALL_SERVICES_COVER_IMAGE}
                        alt="All services"
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : category.cover_image_url ? (
                    <img
                        src={category.cover_image_url}
                        alt={category.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <span className="font-display text-3xl text-frost/90">{category.name.charAt(0)}</span>
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-abyss/70 via-abyss/0 to-abyss/0" />
                <div className="absolute bottom-3 left-3 right-3">
                    <h3 className="font-display text-lg text-frost leading-tight mb-0.5 truncate">{name}</h3>
                    <p className="text-frost/75 text-xs">
                        {count} {count === 1 ? "service" : "services"}
                    </p>
                </div>
            </div>
        </Link>
    );
}
