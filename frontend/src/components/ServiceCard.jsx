import { memo } from "react";
import { Link } from "react-router-dom";
import { useCurrency } from "../context/CurrencyContext";
import { useDataSaver } from "../context/DataSaverContext";

// Human-readable label per pricing_model (migration 062). Kept here
// rather than duplicated across ServiceCard/ServiceDetail.
const PRICING_LABELS = {
    fixed: "",
    per_night: "/ night",
    per_hour: "/ hour",
    per_day: "/ day",
    per_person: "/ person"
};

function ServiceCard({ service, layout = "grid" }) {
    const { format } = useCurrency();
    const dataSaver = useDataSaver();
    const hasDiscount = service.discount_price && Number(service.discount_price) < Number(service.base_price);
    const isList = layout === "list";
    const priceSuffix = PRICING_LABELS[service.pricing_model] || "";

    const media = (
        <div className={`bg-line/40 rounded-md overflow-hidden relative ${isList ? "w-24 h-24 sm:w-32 sm:h-32 shrink-0" : "aspect-square mb-3"}`}>
            {service.image_url ? (
                <img
                    src={dataSaver?.optimize(service.image_url) || service.image_url}
                    alt={service.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-ash text-xs">
                    No photo
                </div>
            )}

            {service.is_verified === 1 || service.is_verified === true ? (
                <span className="absolute top-2 left-2 bg-teal text-frost text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
                        <path d="M12 2 4 5v6c0 5.5 3.4 9.7 8 11 4.6-1.3 8-5.5 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 5.1-5.1 1.4 1.4-6.5 6.5Z" />
                    </svg>
                    Verified
                </span>
            ) : null}
        </div>
    );

    const providerLine = (
        <p className="text-xs text-ash uppercase tracking-wide mb-1 flex items-center gap-1">
            <span className="truncate min-w-0">{service.store_name}</span>
            {service.city && (
                <span className="normal-case tracking-normal text-ash/80 flex items-center gap-0.5 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-2.5 h-2.5 shrink-0">
                        <path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21Z" />
                        <circle cx="12" cy="10.5" r="2" />
                    </svg>
                    {service.city}
                </span>
            )}
        </p>
    );

    const priceRow = (
        <div className="flex items-baseline gap-2 flex-wrap">
            <span className="price text-base font-medium text-ink">
                {format(hasDiscount ? service.discount_price : service.base_price)}
            </span>
            {priceSuffix && <span className="text-xs text-ash">{priceSuffix}</span>}
            {hasDiscount && (
                <span className="price text-xs text-ash line-through">
                    {format(service.base_price)}
                </span>
            )}
        </div>
    );

    // Phase 4 (Customer Experience) - same row shape as ProductCard.jsx's
    // ratingAndStock (category takes the stock slot, since a service
    // listing has no stock concept), so both card types line up the same
    // way instead of the category and rating stacking as separate rows.
    const categoryAndRating = (service.category_name || service.average_rating) ? (
        <div className="flex items-center justify-between mt-1 gap-2">
            {service.category_name ? (
                <p className="text-xs text-ash truncate">{service.category_name}</p>
            ) : <span />}

            {service.average_rating ? (
                <p className="text-xs text-ash shrink-0 flex items-center gap-0.5">
                    <span className="text-mango">★</span> {Number(service.average_rating).toFixed(1)}
                    <span className="text-ash/70">({service.review_count})</span>
                </p>
            ) : null}
        </div>
    ) : null;

    if (isList) {
        return (
            <Link
                to={`/services/${service.slug}`}
                className="tag-string group relative flex gap-4 bg-paper border border-line rounded-lg p-3 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
                {media}

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    {providerLine}
                    <h3 className="text-sm font-medium leading-snug line-clamp-2 mb-2">{service.title}</h3>
                    {priceRow}
                    {categoryAndRating}
                </div>
            </Link>
        );
    }

    return (
        <Link
            to={`/services/${service.slug}`}
            className="tag-string group relative block bg-paper border border-line rounded-lg pt-4 px-3 pb-3 hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
            {media}

            {providerLine}
            <h3 className="text-sm font-medium leading-snug line-clamp-2 mb-2">{service.title}</h3>

            {priceRow}
            {categoryAndRating}
        </Link>
    );
}

export default memo(ServiceCard);
