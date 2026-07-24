import { Link } from "react-router-dom";

// Featured store tile for the department page. Phase 5A added the public
// store profile page this links to - no other change needed here, per the
// plan this component's own comment left for that phase.
//
// Phase 8B: `store.is_featured` (from findFeaturedStoresByCategory's new
// store_featured_campaigns join) marks a store with a currently-active,
// paid campaign for this exact department - shown as a small "Featured"
// badge so it reads as a distinct, purchased placement rather than
// looking identical to an organically-ranked row.
export default function FeaturedStoreCard({ store }) {
    return (
        <Link
            to={`/stores/${store.store_slug}`}
            className="border border-line rounded-lg p-4 flex items-center gap-3 hover:shadow-md transition-shadow"
        >
            <div className="w-12 h-12 rounded-full bg-line/40 overflow-hidden shrink-0">
                {store.store_logo ? (
                    <img src={store.store_logo} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : null}
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{store.store_name}</p>
                    {store.is_verified ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-teal shrink-0">
                            <path d="M12 2 4 5v6c0 5.5 3.4 9.7 8 11 4.6-1.3 8-5.5 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 5.1-5.1 1.4 1.4-6.5 6.5Z" />
                        </svg>
                    ) : null}
                    {store.is_featured ? (
                        <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-mango/20 text-mango-dark shrink-0">
                            Featured
                        </span>
                    ) : null}
                </div>
                <p className="text-xs text-ash">
                    {store.average_rating ? (
                        <>★ {Number(store.average_rating).toFixed(1)} · </>
                    ) : null}
                    {store.product_count} {store.product_count === 1 ? "product" : "products"} in this department
                </p>
            </div>
        </Link>
    );
}
