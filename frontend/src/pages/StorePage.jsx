import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import { formatMonthYear, formatDate } from "../utils/format";
import ProductFilters from "../components/ProductFilters";
import ProductGrid from "../components/ProductGrid";
import ServiceCard from "../components/ServiceCard";
import ProductRow from "../components/ProductRow";
import RatingBreakdown from "../components/RatingBreakdown";
import { getStoreTheme } from "../utils/storeThemes";
import { getSocialLinks } from "../utils/socialLinks";
import { useLanguage } from "../context/LanguageContext";
import { getVerificationTier, VERIFICATION_LABEL_KEYS } from "../utils/verificationTier";
import { useAuth } from "../context/AuthContext";
import PageMeta from "../components/PageMeta";
import { feedLink } from "../utils/feedLink";
import Breadcrumbs from "../components/ui/Breadcrumbs";
import { SITE_URL, buildBreadcrumbJsonLd } from "../utils/seo";
import VideoLightbox from "../components/VideoLightbox";
import { getTodayHours, formatReplyTime } from "../utils/storeSignals";
// Moved to its own file so Footer.jsx (which renders on every page) can
// import it without statically pulling in this whole lazy-loaded route -
// see components/SocialIcon.jsx for why. Re-exported here too, in case
// anything still imports SocialIcon from this module's old location.
import { SocialIcon } from "../components/SocialIcon";

export { SocialIcon };


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
    const { user } = useAuth();
    const navigate = useNavigate();
    const [messageBusy, setMessageBusy] = useState(false);
    const [shareNote, setShareNote] = useState("");
    const [store, setStore] = useState(null);
    // Phase 7 (Promo Video Unification) - whether the store's promo
    // video (if any) is currently open in the lightbox.
    const [promoVideoOpen, setPromoVideoOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [catalogFilters, setCatalogFilters] = useState({});
    const [productCount, setProductCount] = useState(null);
    const [collections, setCollections] = useState([]);

    // Follow store (Phase 6, UI/UX remediation).
    const [followStatus, setFollowStatus] = useState(null);
    const [followBusy, setFollowBusy] = useState(false);

    useEffect(() => {
        if (user?.role !== "buyer") {
            setFollowStatus(null);
            return;
        }
        api.get(`/stores/${slug}/follow-status`)
            .then(({ data }) => setFollowStatus(data.data))
            .catch(() => {});
    }, [slug, user]);

    const handleMessageSeller = async () => {
        if (!user) {
            navigate("/login", { state: { from: `/stores/${slug}` } });
            return;
        }
        setMessageBusy(true);
        try {
            const { data } = await api.post("/chat/conversations", { other_user_id: store.user_id, role: "seller" });
            navigate(`/messages/${data.data.id}`);
        } catch {
            setShareNote(t("store.messageError"));
        } finally {
            setMessageBusy(false);
        }
    };

    const handleShareStore = async () => {
        const url = `${window.location.origin}/stores/${store.store_slug || slug}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: store.store_name, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            setShareNote(t("store.linkCopied"));
        } catch {
            /* share sheet dismissed */
        }
    };

    const handleToggleFollow = async () => {
        setFollowBusy(true);
        try {
            if (followStatus?.following) {
                await api.delete(`/stores/${slug}/follow`);
                setFollowStatus((prev) => ({ following: false, followerCount: Math.max(0, (prev?.followerCount || 1) - 1) }));
            } else {
                await api.post(`/stores/${slug}/follow`);
                setFollowStatus((prev) => ({ following: true, followerCount: (prev?.followerCount || 0) + 1 }));
            }
        } catch {
            // A failed follow/unfollow just leaves the button in its
            // current state - the click simply didn't take effect,
            // which is self-evident without a dedicated error message.
        } finally {
            setFollowBusy(false);
        }
    };

    const [reviews, setReviews] = useState([]);
    const [storeServices, setStoreServices] = useState([]);
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
        api.get(`/stores/${slug}/services`)
            .then(({ data }) => setStoreServices(data.data || []))
            .catch(() => setStoreServices([]));
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
                <PageMeta title={t("store.notFoundTitle")} noIndex />
                <p className="font-display text-2xl mb-2">{t("store.notFoundTitle")}</p>
                <Link to="/" className="text-teal hover:underline text-sm">{t("common.browseMarketplace")}</Link>
            </div>
        );
    }

    const location = [store.city, store.region, store.country].filter(Boolean).join(", ");
    const verificationTier = getVerificationTier(store);
    const isVerified = verificationTier !== null;
    const theme = getStoreTheme(store.store_theme);
    const socialLinks = getSocialLinks(store);


    // Signal row: sold count, typical reply time, today's hours. Each item
    // only appears when there's real data behind it.
    const storeSignalItems = [];
    if (store && Number(store.sold_count) > 0) {
        storeSignalItems.push({ key: "sold", text: t("store.soldCount", { count: Number(store.sold_count) }) });
    }
    if (store && store.response_samples >= 3) {
        const reply = formatReplyTime(store.response_minutes);
        if (reply) storeSignalItems.push({ key: "reply", text: t(reply.key, { n: reply.n }) });
    }
    const todayHours = store ? getTodayHours(store.opening_hours) : null;
    if (todayHours) {
        storeSignalItems.push({
            key: "hours",
            text: todayHours.status === "open"
                ? t("store.hoursToday", { open: todayHours.open, close: todayHours.close })
                : t("store.closedToday"),
        });
    }

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
                jsonLd={[
                    {
                        "@context": "https://schema.org",
                        "@type": "Store",
                        "@id": `${SITE_URL}/stores/${store.store_slug || slug}#store`,
                        name: store.store_name,
                        url: `${SITE_URL}/stores/${store.store_slug || slug}`,
                        ...(store.store_description || store.store_tagline
                            ? { description: store.store_description?.slice(0, 300) || store.store_tagline }
                            : {}),
                        ...(store.store_logo ? { logo: store.store_logo } : {}),
                        ...(store.store_banner || store.store_logo ? { image: store.store_banner || store.store_logo } : {}),
                        ...(store.city || store.region || store.country
                            ? {
                                address: {
                                    "@type": "PostalAddress",
                                    ...(store.city ? { addressLocality: store.city } : {}),
                                    ...(store.region ? { addressRegion: store.region } : {}),
                                    ...(store.country ? { addressCountry: store.country } : {})
                                }
                            }
                            : {}),
                        ...(reviewSummary.review_count > 0 && reviewSummary.average_rating
                            ? {
                                aggregateRating: {
                                    "@type": "AggregateRating",
                                    ratingValue: Number(reviewSummary.average_rating).toFixed(1),
                                    reviewCount: reviewSummary.review_count
                                }
                            }
                            : {}),
                        ...(socialLinks.filter((l) => l.key !== "whatsapp").length
                            ? { sameAs: socialLinks.filter((l) => l.key !== "whatsapp").map((l) => l.href) }
                            : {})
                    },
                    buildBreadcrumbJsonLd(
                        [{ label: t("nav.home"), href: "/" }, { label: store.store_name }],
                        `/stores/${store.store_slug || slug}`
                    )
                ]}
            />
            <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
                <Breadcrumbs items={[{ label: t("nav.home"), href: "/" }, { label: store.store_name }]} />
            </div>
            <div className="relative h-40 sm:h-56 bg-line/40 overflow-hidden">
                {store.store_banner ? (
                    <img src={store.store_banner} alt="" fetchPriority="high" decoding="async" className="w-full h-full object-cover" />
                ) : (
                    // Fallback banner: themed block with the store's name so
                    // stores without a banner don't show an empty grey strip.
                    <div className={`w-full h-full ${theme.bg} flex items-center justify-center px-6`}>
                        <p className={`${theme.badgeText} font-display text-xl sm:text-2xl opacity-90 truncate`}>
                            {t("store.fallbackBannerTagline", { name: store.store_name })}
                        </p>
                    </div>
                )}
                {store.promo_video_url && (
                    <button
                        type="button"
                        onClick={() => setPromoVideoOpen(true)}
                        aria-label={t("store.watchPromoVideo")}
                        className="absolute inset-0 flex items-center justify-center bg-abyss/20 hover:bg-abyss/35 transition-colors group"
                    >
                        <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-frost/90 group-hover:bg-frost flex items-center justify-center shadow-md transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 sm:w-6 sm:h-6 text-ink ml-0.5">
                                <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                            </svg>
                        </span>
                    </button>
                )}
            </div>
            {store.promo_video_url && promoVideoOpen && (
                <VideoLightbox src={store.promo_video_url} onClose={() => setPromoVideoOpen(false)} />
            )}

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
                                    {t(VERIFICATION_LABEL_KEYS[verificationTier])}
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
                                    <span className="text-ash">({store.review_count})</span>
                                </span>
                            )}
                            {store.average_rating && <span>·</span>}
                            <span>{t("store.memberSince", { date: formatMonthYear(store.created_at) })}</span>
                        </p>
                        {storeSignalItems.length > 0 && (
                            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/80 mt-2">
                                {storeSignalItems.map((item) => (
                                    <li key={item.key} className="flex items-center gap-1">{item.text}</li>
                                ))}
                            </ul>
                        )}
                        {store.public_phone && (
                            <a
                                href={`tel:${store.public_phone.replace(/[^+0-9]/g, "")}`}
                                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors"
                            >
                                {t("store.callProvider")}
                            </a>
                        )}
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

                    <div className="ml-auto shrink-0 flex items-center gap-2">
                        {user?.id !== store.user_id && (
                            <button
                                type="button"
                                onClick={handleMessageSeller}
                                disabled={messageBusy}
                                className="px-3 py-2 rounded-md text-sm border border-line hover:border-ink transition-colors disabled:opacity-60"
                            >
                                {t("store.messageSeller")}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleShareStore}
                            className="px-3 py-2 rounded-md text-sm border border-line hover:border-ink transition-colors"
                        >
                            {t("store.share")}
                        </button>
                    </div>
                    {user?.role === "buyer" && (
                        <button
                            type="button"
                            onClick={handleToggleFollow}
                            disabled={followBusy}
                            className={`shrink-0 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60 ${
                                followStatus?.following
                                    ? "border border-line text-ink hover:border-coral hover:text-coral"
                                    : "bg-ink text-paper hover:bg-abyss"
                            }`}
                        >
                            {followStatus?.following ? t("store.following") : t("store.follow")}
                        </button>
                    )}
                </div>

                {shareNote && <p role="status" className="text-xs text-ash mb-4">{shareNote}</p>}

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

                        {verificationTier === "business" && (
                            <div className="flex items-start gap-2.5 text-sm">
                                <VerifiedIcon className={theme.text} />
                                <div>
                                    <p className="font-medium text-ink">{t("store.verifiedBusinessTitle")}</p>
                                    <p className="text-xs text-ash mt-0.5">
                                        {t("store.verifiedBusinessHint")}
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

                    <div className="flex justify-end mb-3">
                        <Link
                            to={feedLink({ seller_id: store.user_id, ...catalogFilters })}
                            className="text-sm border border-line px-4 py-2 rounded-full hover:border-ink transition-colors"
                        >
                            {t("products.shopFeed")}
                        </Link>
                    </div>
                    <ProductFilters singleStore onChange={setCatalogFilters} />

                    <ProductGrid
                        params={{ seller_id: store.user_id, ...catalogFilters }}
                        onResults={setProductCount}
                        emptyTitle={t("store.noProductsTitle")}
                        emptyHint={t("store.noProductsHint")}
                    />

                    {storeServices.length > 0 && (
                        <section className="mt-12">
                            <h2 className="font-display text-xl mb-4">{t("seo.store.services")}</h2>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {storeServices.map((service) => (
                                    <ServiceCard key={service.id} service={service} />
                                ))}
                            </div>
                        </section>
                    )}
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
