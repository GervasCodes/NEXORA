import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";
import { formatMonthYear, formatDate } from "../utils/format";
import ProductFilters from "../components/ProductFilters";
import ProductGrid from "../components/ProductGrid";
import ProductRow from "../components/ProductRow";
import RatingBreakdown from "../components/RatingBreakdown";
import { getStoreTheme } from "../utils/storeThemes";
import { getSocialLinks } from "../utils/socialLinks";
import { useLanguage } from "../context/LanguageContext";
import PageMeta from "../components/PageMeta";


// Exported so Footer.jsx (Phase 5, Visual Polish & Metadata) can reuse it
// for NEXORA's own company social links, instead of a second copy of the
// same three icon paths.
export function SocialIcon({ name }) {
    if (name === "instagram") {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
            </svg>
        );
    }
    if (name === "facebook") {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                <path d="M14 21v-7h2.5l.5-3H14V9c0-1 .3-1.7 1.7-1.7H17V4.6c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4V11H8.5v3H10.8v7Z" strokeLinejoin="round" />
            </svg>
        );
    }
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
            <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" strokeLinejoin="round" />
            <path d="M8.5 8.5c.3-.6 1-.6 1.3 0l.6 1.2c.2.4 0 .8-.3 1.1-.4.4-.4.8-.1 1.3.5.9 1.3 1.7 2.2 2.2.5.3.9.3 1.3-.1.3-.3.7-.5 1.1-.3l1.2.6c.6.3.6 1 0 1.3-1 .6-2.3.8-3.5.2-1.7-.8-3.1-2.2-3.9-3.9-.6-1.2-.4-2.5.2-3.5Z" strokeLinejoin="round" />
        </svg>
    );
}


function VerifiedIcon({ className = "" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 shrink-0 mt-0.5 ${className}`}>
            <path d="M12 2 4 5v6c0 5.5 3.4 9.7 8 11 4.6-1.3 8-5.5 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 5.1-5.1 1.4 1.4-6.5 6.5Z" />
        </svg>
    );
}

function IdentityIcon({ className = "" }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={`w-5 h-5 shrink-0 mt-0.5 ${className}`}>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="12" r="2.25" />
            <path d="M6 16.5c.6-1.4 1.7-2.1 3-2.1s2.4.7 3 2.1" strokeLinecap="round" />
            <path d="M14.5 10h4M14.5 13h3" strokeLinecap="round" />
        </svg>
    );
}

export default function StorePage() {
    const { slug } = useParams();
    const { t } = useLanguage();
    const [store, setStore] = useState(null);
    const [loading, setLoading] = useState(true);
    const [catalogFilters, setCatalogFilters] = useState({});
    const [productCount, setProductCount] = useState(null);
    const [collections, setCollections] = useState([]);

    const [reviews, setReviews] = useState([]);
    const [reviewSummary, setReviewSummary] = useState({ average_rating: null, review_count: 0 });
    const [reviewBreakdown, setReviewBreakdown] = useState(null);
    const [reviewSort, setReviewSort] = useState("newest");
    const [reviewsPage, setReviewsPage] = useState(1);
    const [reviewsTotalPages, setReviewsTotalPages] = useState(1);
    const [reviewsLoading, setReviewsLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        api.get(`/stores/${slug}`)
            .then(({ data }) => setStore(data.data))
            .catch(() => setStore(null))
            .finally(() => setLoading(false));
    }, [slug]);

   
    useEffect(() => {
        api.get(`/stores/${slug}/collections`)
            .then(({ data }) => setCollections(data.data || []))
            .catch(() => setCollections([]));
    }, [slug]);

    
    useEffect(() => {
        if (!store?.user_id) return;

        setReviewsLoading(true);
        api.get(`/reviews/store/${store.user_id}`, { params: { page: 1, sort: reviewSort } })
            .then(({ data }) => {
                setReviews(data.data.reviews || []);
                setReviewSummary({
                    average_rating: data.data.average_rating,
                    review_count: data.data.review_count
                });
                setReviewBreakdown(data.data.rating_breakdown || null);
                setReviewsPage(1);
                setReviewsTotalPages(data.data.totalPages || 1);
            })
            .catch(() => {})
            .finally(() => setReviewsLoading(false));
    }, [store?.user_id, reviewSort]);

    const loadMoreReviews = () => {
        if (!store?.user_id || reviewsLoading) return;

        const nextPage = reviewsPage + 1;
        setReviewsLoading(true);
        api.get(`/reviews/store/${store.user_id}`, { params: { page: nextPage, sort: reviewSort } })
            .then(({ data }) => {
                setReviews((prev) => [...prev, ...(data.data.reviews || [])]);
                setReviewsPage(nextPage);
                setReviewsTotalPages(data.data.totalPages || 1);
            })
            .catch(() => {})
            .finally(() => setReviewsLoading(false));
    };

    if (loading) {
        return <div className="max-w-6xl mx-auto px-6 py-16 text-ash">{t("common.loading")}</div>;
    }

    if (!store) {
        return (
            <div className="max-w-6xl mx-auto px-6 py-16 text-center">
                <p className="font-display text-2xl mb-2">{t("store.notFoundTitle")}</p>
                <Link to="/" className="text-teal hover:underline text-sm">{t("common.browseMarketplace")}</Link>
            </div>
        );
    }

    const location = [store.city, store.region, store.country].filter(Boolean).join(", ");
    const isVerified = store.is_verified === 1 || store.is_verified === true;
    const theme = getStoreTheme(store.store_theme);
    const socialLinks = getSocialLinks(store);

    return (
        <div>
            <PageMeta
                title={store.store_name}
                description={
                    store.store_description?.slice(0, 160) ||
                    store.store_tagline ||
                    `${store.store_name} on NEXORA — browse their products and services.`
                }
                image={store.store_banner || store.store_logo}
                type="website"
            />
            <div className="h-40 sm:h-56 bg-line/40 overflow-hidden">
                {store.store_banner ? (
                    <img src={store.store_banner} alt="" className="w-full h-full object-cover" />
                ) : null}
            </div>

            <div className="max-w-6xl mx-auto px-4 sm:px-6">
                <div className="flex items-end gap-4 -mt-10 mb-6">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-paper border-4 border-paper shadow-sm overflow-hidden shrink-0">
                        {store.store_logo ? (
                            <img src={store.store_logo} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-line/40 text-ash text-xs">
                                {t("store.noLogo")}
                            </div>
                        )}
                    </div>

                    <div className="min-w-0 pb-1">
                        <div className="flex items-center gap-1.5">
                            <h1 className="font-display text-2xl sm:text-3xl truncate">{store.store_name}</h1>
                            {isVerified && (
                                <span className={`${theme.bg} ${theme.badgeText} text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
                                        <path d="M12 2 4 5v6c0 5.5 3.4 9.7 8 11 4.6-1.3 8-5.5 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 5.1-5.1 1.4 1.4-6.5 6.5Z" />
                                    </svg>
                                    {t("store.verifiedBadge")}
                                </span>
                            )}
                        </div>
                        {store.store_tagline && (
                            <p className="text-sm text-ink/80 mt-0.5 line-clamp-2">{store.store_tagline}</p>
                        )}
                        <p className="text-xs text-ash uppercase tracking-wide mt-1">
                            {[store.store_type_name, location].filter(Boolean).join(" · ")}
                        </p>
                        <p className="text-xs text-ash mt-1 flex items-center gap-1.5">
                            {store.average_rating && (
                                <span className="flex items-center gap-0.5">
                                    <span className="text-mango">★</span> {Number(store.average_rating).toFixed(1)}
                                    <span className="text-ash/70">({store.review_count})</span>
                                </span>
                            )}
                            {store.average_rating && <span>·</span>}
                            <span>{t("store.memberSince", { date: formatMonthYear(store.created_at) })}</span>
                        </p>
                        {socialLinks.length > 0 && (
                            <div className="flex items-center gap-2 mt-2">
                                {socialLinks.map((link) => (
                                    <a
                                        key={link.key}
                                        href={link.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={link.label}
                                        aria-label={link.label}
                                        className={`w-7 h-7 rounded-full border border-line flex items-center justify-center hover:border-ink transition-colors ${theme.text}`}
                                    >
                                        <SocialIcon name={link.key} />
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {store.store_description && (
                    <div className="max-w-2xl mb-8">
                        <h2 className="font-display text-lg mb-2">{t("store.about")}</h2>
                        <p className="text-sm text-ink/80 leading-relaxed whitespace-pre-line">
                            {store.store_description}
                        </p>
                    </div>
                )}

                <div className="max-w-2xl mb-10 flex items-start gap-2.5 text-sm text-ink/80">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={`w-5 h-5 shrink-0 mt-0.5 ${theme.text}`}>
                        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7zM6.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" strokeLinejoin="round" />
                    </svg>
                    <div>
                        <p className="font-medium text-ink">{t("store.deliveryTracked")}</p>
                        <p className="text-xs text-ash mt-0.5">
                            {store.has_pickup_pin
                                ? t("store.deliveryPickupNote")
                                : t("store.deliveryDefaultNote")}
                        </p>
                    </div>
                </div>

                {(isVerified || store.identity_verified) && (
                    <div className="max-w-2xl mb-10 space-y-4">
                        <h2 className="font-display text-lg mb-1">{t("store.trustSafety")}</h2>

                        {isVerified && (
                            <div className="flex items-start gap-2.5 text-sm">
                                <VerifiedIcon className={theme.text} />
                                <div>
                                    <p className="font-medium text-ink">{t("store.verifiedSellerTitle")}</p>
                                    <p className="text-xs text-ash mt-0.5">
                                        {t("store.verifiedSellerHint")}
                                    </p>
                                </div>
                            </div>
                        )}

                        {store.identity_verified && (
                            <div className="flex items-start gap-2.5 text-sm">
                                <IdentityIcon className={theme.text} />
                                <div>
                                    <p className="font-medium text-ink">{t("store.identityVerifiedTitle")}</p>
                                    <p className="text-xs text-ash mt-0.5">
                                        {t("store.identityVerifiedHint")}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {collections.map((collection) => (
                    <ProductRow key={collection.id} title={collection.name} products={collection.products} />
                ))}

                <div className="pb-16">
                    <h2 className="font-display text-xl mb-1">{t("store.productsTitle")}</h2>
                    {productCount !== null && (
                        <p className="text-ash text-xs mb-4">
                            {productCount === 1 ? t("store.productCountOne") : t("store.productCountMany", { count: productCount })}
                        </p>
                    )}

                    <ProductFilters singleStore onChange={setCatalogFilters} />

                    <ProductGrid
                        params={{ seller_id: store.user_id, ...catalogFilters }}
                        onResults={setProductCount}
                        emptyTitle={t("store.noProductsTitle")}
                        emptyHint={t("store.noProductsHint")}
                    />
                </div>

                <div className="pb-16 max-w-2xl">
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                        <h2 className="font-display text-xl">{t("reviews.title")}</h2>
                        {reviewSummary.review_count > 0 && (
                            <select
                                value={reviewSort}
                                onChange={(e) => setReviewSort(e.target.value)}
                                className="text-xs border border-line rounded-md px-2 py-1.5 focus-ring"
                            >
                                <option value="newest">{t("filters.sortNewest")}</option>
                                <option value="highest">{t("filters.sortRating")}</option>
                                <option value="lowest">{t("reviews.sortLowest")}</option>
                            </select>
                        )}
                    </div>
                    {reviewSummary.average_rating && (
                        <p className="text-ash text-xs mb-4 flex items-center gap-0.5">
                            <span className="text-mango">★</span> {reviewSummary.review_count === 1
                                ? t("reviews.summaryOne", { rating: reviewSummary.average_rating })
                                : t("reviews.summaryMany", { rating: reviewSummary.average_rating, count: reviewSummary.review_count })}
                        </p>
                    )}

                    <RatingBreakdown breakdown={reviewBreakdown} reviewCount={reviewSummary.review_count} />

                    {!reviewsLoading && reviews.length === 0 && (
                        <p className="text-ash text-sm">{t("reviews.none")}</p>
                    )}

                    <ul className="space-y-4">
                        {reviews.map((r) => (
                            <li key={r.id} className="border-b border-line pb-4">
                                <div className="flex justify-between items-baseline mb-1">
                                    <p className="font-medium text-sm">{r.first_name} {r.last_name}</p>
                                    <p className="text-xs text-ash">{formatDate(r.created_at)}</p>
                                </div>
                                <p className="text-sm text-ash mb-1">★ {r.rating}/5</p>
                                {r.comment && <p className="text-sm text-ink/80 mb-1">{r.comment}</p>}
                                {r.product_slug && (
                                    <Link to={`/products/${r.product_slug}`} className={`text-xs ${theme.text} hover:underline`}>
                                        {t("store.onProduct", { product: r.product_name })}
                                    </Link>
                                )}
                                {r.photos?.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {r.photos.map((photo) => (
                                            <img
                                                key={photo.id}
                                                src={photo.photo_url}
                                                alt=""
                                                loading="lazy"
                                                className="w-16 h-16 rounded-md object-cover border border-line"
                                            />
                                        ))}
                                    </div>
                                )}
                                {r.seller_reply && (
                                    <div className="mt-2 bg-line/30 rounded-md px-3 py-2">
                                        <p className="text-xs font-medium text-ink mb-0.5">{t("reviews.sellerResponse")}</p>
                                        <p className="text-xs text-ink/80">{r.seller_reply}</p>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>

                    {reviewsPage < reviewsTotalPages && (
                        <button
                            onClick={loadMoreReviews}
                            disabled={reviewsLoading}
                            className={`mt-4 text-sm ${theme.text} hover:underline disabled:opacity-50`}
                        >
                            {reviewsLoading ? t("common.loading") : t("reviews.loadMore")}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
