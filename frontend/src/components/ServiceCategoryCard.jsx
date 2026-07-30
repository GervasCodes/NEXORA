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
// same grid as every real category (ServicesBrowse.jsx passes it first) so
// clearing the filter looks like just another card instead of a leftover
// button bolted onto the row.
export default function ServiceCategoryCard({ category, index, active, onSelect, totalCount }) {
    const isAll = !category;
    const gradient = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];
    const name = isAll ? "All services" : category.name;
    const count = isAll ? totalCount : category.serviceCount;

    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={active}
            className={`group block w-full text-left bg-paper border rounded-xl overflow-hidden transition-all ${
                active ? "border-ink shadow-md" : "border-line hover:border-ink hover:shadow-md hover:-translate-y-0.5"
            }`}
        >
            <div
                className="aspect-[4/3] relative overflow-hidden"
                style={isAll ? { background: "linear-gradient(135deg, #111827 0%, #374151 100%)" } : (!category.cover_image_url ? { background: gradient } : undefined)}
            >
                {!isAll && category.cover_image_url ? (
                    <img
                        src={category.cover_image_url}
                        alt={category.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        {isAll ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-8 h-8 text-frost/90">
                                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                            </svg>
                        ) : (
                            <span className="font-display text-3xl text-frost/90">{category.name.charAt(0)}</span>
                        )}
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
        </button>
    );
}
