import { memo } from "react";
import { Link } from "react-router-dom";
import { StarIcon } from "./Icons";
import { useCurrency } from "../context/CurrencyContext";
import { useDataSaver } from "../context/DataSaverContext";
import { useWishlist } from "../context/WishlistContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import VerificationBadge from "./VerificationBadge";

// Human-readable label per pricing_model (migration 062). Kept here
// rather than duplicated across ServiceCard/ServiceDetail.
const PRICING_LABELS = {
    fixed: "",
    per_night: "/ night",
    per_hour: "/ hour",
    per_day: "/ day",
    per_person: "/ person"
};

// 44px hit area; the visible circle is drawn inside it.
const SAVE_BUTTON = "absolute top-3 right-2 z-10 w-11 h-11 flex items-center justify-center";

function ServiceCard({ service }) {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const dataSaver = useDataSaver();
    const wishlist = useWishlist();
    const { user } = useAuth();
    const isGuest = !user;
    const hasDiscount = service.discount_price && Number(service.discount_price) < Number(service.base_price);
    const discountPct = hasDiscount ? Math.round((1 - Number(service.discount_price) / Number(service.base_price)) * 100) : 0;
    const priceSuffix = PRICING_LABELS[service.pricing_model] || "";
    const saved = wishlist?.isSaved(service.id, "service");
    // Guests are sent to sign in, come back here, and see why.
    const loginHref = `/login?returnTo=${encodeURIComponent(`/services/${service.slug}`)}&intent=save`;

    const handleToggleSave = () => wishlist?.toggle(service.id, "service");

    const media = (
        <div className="bg-line/40 rounded-md overflow-hidden relative aspect-square mb-3">
            {service.image_url ? (
                <img
                    src={dataSaver?.optimize(service.image_url) || service.image_url}
                    alt={service.title}
                    width={400}
                    height={400}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-ash text-xs">
                    {t("services.noPhoto")}
                </div>
            )}

            <VerificationBadge entity={service} corner="top-left" />

            {hasDiscount && (
                <span className="absolute bottom-2 right-2 bg-coral text-frost text-[11px] font-semibold rounded-full px-2 py-0.5">
                    -{discountPct}%
                </span>
            )}
        </div>
    );

    const providerLine = (
        <p className="text-xs text-ash uppercase tracking-wide mb-1 flex items-center gap-1">
            <span className="truncate min-w-0">{service.store_name}</span>
            {service.city && (
                <span className="normal-case tracking-normal text-ash flex items-center gap-0.5 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-2.5 h-2.5 shrink-0" aria-hidden="true">
                        <path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21Z" />
                        <circle cx="12" cy="10.5" r="2" />
                    </svg>
                    {service.city}
                </span>
            )}
            {service.distance_km != null && (
                <span className="normal-case tracking-normal text-teal shrink-0">
                    {t("services.distanceAway", { km: Number(service.distance_km).toFixed(1) })}
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

    // Category takes the stock slot in the row (services have no stock), so
    // the card lines up with ProductCard. flex-1 min-w-0 lets long category
    // names truncate inside the 2-column grid instead of stretching the card.
    const categoryAndRating = (service.category_name || service.average_rating) ? (
        <div className="flex items-center justify-between mt-1 gap-2">
            {service.category_name ? (
                <p className="text-xs text-ash truncate flex-1 min-w-0">{service.category_name}</p>
            ) : <span />}

            {service.average_rating ? (
                <p className="text-xs text-ash shrink-0 flex items-center gap-0.5">
                    <StarIcon className="w-3 h-3 text-mango" /> {Number(service.average_rating).toFixed(1)}
                    <span className="text-ash">({service.review_count})</span>
                </p>
            ) : null}
        </div>
    ) : null;

    // Save sits beside the link, not inside it, so there are no nested
    // interactive elements. Sellers see no save control.
    const saveButton = (user?.role === "buyer" || isGuest) && (
        isGuest ? (
            <Link to={loginHref} aria-label={t("products.feedSignIn")} className={SAVE_BUTTON}>
                <span className="w-7 h-7 rounded-full glass-strong flex items-center justify-center" />
            </Link>
        ) : (
            <button
                type="button"
                onClick={handleToggleSave}
                aria-label={saved ? t("products.feedRemoveSaved") : t("products.feedSave")}
                aria-pressed={!!saved}
                className={SAVE_BUTTON}
            >
                <span className="w-7 h-7 rounded-full glass-strong flex items-center justify-center hover:scale-110 transition-transform">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill={saved ? "#e4572e" : "none"}
                        stroke={saved ? "#e4572e" : "currentColor"}
                        strokeWidth="2"
                        className="w-3.5 h-3.5"
                        aria-hidden="true"
                    >
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
                    </svg>
                </span>
            </button>
        )
    );

    return (
        <div className="tag-string group relative block bg-paper border border-line rounded-lg pt-4 px-3 pb-3 hover:shadow-md hover:-translate-y-0.5 transition-all">
            <Link to={`/services/${service.slug}`} className="block">
                {media}
                {providerLine}
                <h3 className="text-sm font-medium leading-snug line-clamp-2 mb-2">{service.title}</h3>
                {priceRow}
                {categoryAndRating}
            </Link>
            {saveButton}
        </div>
    );
}

export default memo(ServiceCard);
