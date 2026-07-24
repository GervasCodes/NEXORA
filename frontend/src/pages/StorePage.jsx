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

// Phase 5A: the store profile page's first slice - identity and branding
// only (name, logo, banner, description, store type, general location).
// Phase 5B added trust info (verified badge, store-wide rating, member
// since) below. Phase 5C added the store's product catalog beneath that -
// the same ProductFilters/ProductGrid pair BrowseProducts and
// DepartmentPage already use against the public GET /products listing,
// scoped to this store via `seller_id` instead of `category_id`, so
// pagination, infinite scroll, price/rating filters, sorting, and the
// grid/list view toggle all come for free instead of being rebuilt here.
// Phase 5D adds the three remaining pieces named in its title: an "About"
// heading over the description paragraph 5A already rendered, a Delivery
// info line driven by the new `has_pickup_pin` flag, and a paginated
// Reviews section pulling from the new GET /reviews/store/:sellerId
// endpoint (a store-scoped sibling of the GET /reviews/product/:productId
// call ProductDetail.jsx already makes). Loading/not-found states follow
// ProductDetail.jsx's existing pattern for a page fetched by slug.
//
// Phase 7A (Store Themes) swaps the hardcoded `text-teal`/`bg-teal`
// accents below for `theme.text`/`theme.bg`, derived from the seller's
// chosen `store_theme` via utils/storeThemes.js. Only accent color
// changes - layout, copy, and every non-accent color (ink/ash/paper/
// mango star ratings) are untouched.
//
// Phase 7B (Branding) adds two more seller-controlled display fields
// from utils/socialLinks.js: `store_tagline`, a short line rendered right
// under the store name, and up to three social icon links (Instagram/
// Facebook/WhatsApp) rendered under the location/rating line. Both are
// entirely optional - a store with neither renders exactly as it did
// before this phase.
//
// Phase 7C (Seller Collections) adds an optional row of shelves above
// the "Products" catalog heading: GET /stores/:slug/collections returns
// each of the seller's named collections that still has at least one
// active product, each already shaped like the product-listing rows
// ProductGrid/ProductRow already know how to render - so each collection
// is just `<ProductRow title={c.name} products={c.products} />`, reusing
// the same horizontal-scroll strip Home.jsx already uses for "Trending"/
// "Recently added". A store with no collections renders nothing new.
//
// Phase 7D (Verification & Trust) adds a "Trust & safety" section
// spelling out what the page's two independent trust signals actually
// mean: the existing paid "Verified Seller" badge (`is_verified`, shown
// as a compact pill next to the store name since Phase 5B) and the new
// `identity_verified` flag (NEXORA reviewed this seller's identity
// documents before their account could sell at all - a check every
// operating seller has already passed, but never previously shown to
// buyers). Renders only the rows that apply, and not at all when neither
// is true.

// Three fixed icons for the social links row - not a general-purpose icon
// set, just the one per platform getSocialLinks can ever return.
function SocialIcon({ name }) {
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

// A second fixed icon, alongside SocialIcon above - Phase 7D's "Identity
// Verified" row needs its own glyph, distinct from the header's existing
// checkmark-in-a-shield "Verified Seller" badge, so the two rows in the
// Trust & safety section don't look like duplicates of one signal.
// Reuses the exact checkmark-shield path the header's compact "Verified"
// pill already renders (see the badge markup further down) - same glyph,
// just sized for a Trust & safety row instead of a small inline pill.
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

    // Phase 7C - a separate, independent fetch (like reviews below), so a
    // store with zero collections (the common case, before any seller
    // opts into this feature) never blocks or delays anything else on the
    // page. Failure just leaves the row list empty rather than surfacing
    // an error - collections are a bonus display, not core store data.
    useEffect(() => {
        api.get(`/stores/${slug}/collections`)
            .then(({ data }) => setCollections(data.data || []))
            .catch(() => setCollections([]));
    }, [slug]);

    // Reviews are fetched once we know the store's user_id (needed for
    // the /reviews/store/:sellerId path), separately from the store
    // profile fetch above - same two-call pattern 5C's catalog fetch
    // already established for this page. Resets back to page 1 whenever
    // the store itself changes (i.e. a fresh slug) or the sort changes
    // (Phase 6C).
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
        return <div className="max-w-6xl mx-auto px-6 py-16 text-ash">Loading…</div>;
    }

    if (!store) {
        return (
            <div className="max-w-6xl mx-auto px-6 py-16 text-center">
                <p className="font-display text-2xl mb-2">Store not found</p>
                <Link to="/" className="text-teal hover:underline text-sm">Back to marketplace</Link>
            </div>
        );
    }

    const location = [store.city, store.region, store.country].filter(Boolean).join(", ");
    const isVerified = store.is_verified === 1 || store.is_verified === true;
    const theme = getStoreTheme(store.store_theme);
    const socialLinks = getSocialLinks(store);

    return (
        <div>
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
                                No logo
                            </div>
                        )}
                    </div>

                    <div className="min-w-0 pb-1">
                        <div className="flex items-center gap-1.5">
                            <h1 className="font-display text-2xl sm:text-3xl truncate">{store.store_name}</h1>
                            {isVerified && (
                                <span className={`${theme.bg} text-paper text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
                                        <path d="M12 2 4 5v6c0 5.5 3.4 9.7 8 11 4.6-1.3 8-5.5 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 5.1-5.1 1.4 1.4-6.5 6.5Z" />
                                    </svg>
                                    Verified
                                </span>
                            )}
                        </div>
                        {store.store_tagline && (
                            <p className="text-sm text-ink/80 mt-0.5">{store.store_tagline}</p>
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
                            <span>Member since {formatMonthYear(store.created_at)}</span>
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
                        <h2 className="font-display text-lg mb-2">About</h2>
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
                        <p className="font-medium text-ink">Delivery tracked door to door</p>
                        <p className="text-xs text-ash mt-0.5">
                            {store.has_pickup_pin
                                ? "This store has a pickup location set, so delivery fees are calculated by distance at checkout."
                                : "Delivery fees are calculated at checkout."}
                        </p>
                    </div>
                </div>

                {(isVerified || store.identity_verified) && (
                    <div className="max-w-2xl mb-10 space-y-4">
                        <h2 className="font-display text-lg mb-1">Trust &amp; safety</h2>

                        {isVerified && (
                            <div className="flex items-start gap-2.5 text-sm">
                                <VerifiedIcon className={theme.text} />
                                <div>
                                    <p className="font-medium text-ink">Verified Seller</p>
                                    <p className="text-xs text-ash mt-0.5">
                                        This seller has paid NEXORA's verification fee and passed the Verified
                                        Seller review - the same badge shown on their individual products.
                                    </p>
                                </div>
                            </div>
                        )}

                        {store.identity_verified && (
                            <div className="flex items-start gap-2.5 text-sm">
                                <IdentityIcon className={theme.text} />
                                <div>
                                    <p className="font-medium text-ink">Identity Verified</p>
                                    <p className="text-xs text-ash mt-0.5">
                                        NEXORA reviewed this seller's identity documents before their account
                                        was approved to sell - separate from, and required before, the paid
                                        Verified Seller badge above.
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
                    <h2 className="font-display text-xl mb-1">Products</h2>
                    {productCount !== null && (
                        <p className="text-ash text-xs mb-4">
                            {productCount === 1 ? "1 product" : `${productCount} products`}
                        </p>
                    )}

                    <ProductFilters singleStore onChange={setCatalogFilters} />

                    <ProductGrid
                        params={{ seller_id: store.user_id, ...catalogFilters }}
                        onResults={setProductCount}
                        emptyTitle="No products yet"
                        emptyHint="This store hasn't listed anything yet - check back soon."
                    />
                </div>

                <div className="pb-16 max-w-2xl">
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                        <h2 className="font-display text-xl">Reviews</h2>
                        {reviewSummary.review_count > 0 && (
                            <select
                                value={reviewSort}
                                onChange={(e) => setReviewSort(e.target.value)}
                                className="text-xs border border-line rounded-md px-2 py-1.5 focus-ring"
                            >
                                <option value="newest">Newest</option>
                                <option value="highest">Highest rated</option>
                                <option value="lowest">Lowest rated</option>
                            </select>
                        )}
                    </div>
                    {reviewSummary.average_rating && (
                        <p className="text-ash text-xs mb-4 flex items-center gap-0.5">
                            <span className="text-mango">★</span> {reviewSummary.average_rating} average ·{" "}
                            {reviewSummary.review_count === 1
                                ? "1 review"
                                : `${reviewSummary.review_count} reviews`}
                        </p>
                    )}

                    <RatingBreakdown breakdown={reviewBreakdown} reviewCount={reviewSummary.review_count} />

                    {!reviewsLoading && reviews.length === 0 && (
                        <p className="text-ash text-sm">No reviews yet.</p>
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
                                        on {r.product_name}
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
                                        <p className="text-xs font-medium text-ink mb-0.5">Seller response</p>
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
                            {reviewsLoading ? "Loading…" : "Load more reviews"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
