import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import { useWishlist } from "../context/WishlistContext";
import { useToast } from "../context/ToastContext";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import RatingBreakdown from "../components/RatingBreakdown";
import Button from "../components/ui/Button";
import QuantityStepper from "../components/ui/QuantityStepper";
import RecommendedProducts from "../components/RecommendedProducts";
import ProductQA from "../components/ProductQA";
import PageMeta from "../components/PageMeta";
import ImageLightbox from "../components/chat/ImageLightbox";
import Avatar from "../components/ui/Avatar";
import Breadcrumbs from "../components/ui/Breadcrumbs";
import Skeleton from "../components/Skeleton";

export default function ProductDetail() {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const { slug } = useParams();
    const { user } = useAuth();
    const { addToCart } = useCart();
    const wishlist = useWishlist();
    const toast = useToast();
    const navigate = useNavigate();

    const [product, setProduct] = useState(null);
    const [reviews, setReviews] = useState(null);
    const [reviewSort, setReviewSort] = useState("newest");
    const [activeImage, setActiveImage] = useState(0);
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const [quantity, setQuantity] = useState(1);

    // Variant selection (Phase 2 continuation, UI/UX remediation) -
    // { "Size": "M", "Color": "Red" }, built up as the buyer taps each
    // option axis's buttons. A product with no variants (product.options
    // is empty) never touches this - selectedVariant stays null and
    // Add to Cart behaves exactly as it did before variants existed.
    const [selectedOptions, setSelectedOptions] = useState({});

    // Back-in-stock / price-drop alerts (Phase 5, UI/UX remediation).
    // Scoped to the base product only, not per-variant - product_alerts
    // has no variant_id (see migration 096's comment: "which variant"
    // is ambiguous for a product with several, so the back-in-stock
    // toggle below only ever shows for products with no variants at
    // all; the price-drop toggle tracks the base product price
    // regardless of variants, since a variant's price_delta is always
    // an adjustment on top of that base price, not a separate price).
    const [alertSubs, setAlertSubs] = useState([]);
    const [alertBusy, setAlertBusy] = useState(null);
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(true);

   
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [reviewRating, setReviewRating] = useState(5);
    const [reviewComment, setReviewComment] = useState("");
    const [submittingReview, setSubmittingReview] = useState(false);
    const [reviewError, setReviewError] = useState("");
    const [justSubmittedId, setJustSubmittedId] = useState(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    
    const MAX_REVIEW_PHOTOS = 5;

    useEffect(() => {
        setLoading(true);
        api.get(`/products/${slug}`)
            .then(({ data }) => setProduct(data.data))
            .catch(() => setProduct(null))
            .finally(() => setLoading(false));
    }, [slug]);

    const loadReviews = () => {
        if (!product) return;
        api.get(`/reviews/product/${product.id}`, { params: { sort: reviewSort } })
            .then(({ data }) => setReviews(data.data))
            .catch(() => {});
    };

    useEffect(loadReviews, [product, reviewSort]);

    useEffect(() => {
        if (!product || user?.role !== "buyer") {
            setAlertSubs([]);
            return;
        }
        api.get(`/products/${product.id}/alerts`)
            .then(({ data }) => setAlertSubs(data.data || []))
            .catch(() => {});
    }, [product, user]);

    const toggleAlert = async (type) => {
        setAlertBusy(type);
        const subscribed = alertSubs.includes(type);
        try {
            if (subscribed) {
                await api.delete(`/products/${product.id}/alerts/${type}`);
                setAlertSubs((prev) => prev.filter((t) => t !== type));
            } else {
                await api.post(`/products/${product.id}/alerts`, { type });
                setAlertSubs((prev) => [...prev, type]);
            }
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setAlertBusy(null);
        }
    };

    const handleReviewSubmit = async (e) => {
        e.preventDefault();
        setSubmittingReview(true);
        setReviewError("");
        try {
            const { data } = await api.post("/reviews", {
                product_id: product.id,
                rating: reviewRating,
                comment: reviewComment
            });
            setJustSubmittedId(data.data.reviewId);
            setReviewComment("");
            loadReviews();
        } catch (err) {
            setReviewError(extractErrorMessage(err));
        } finally {
            setSubmittingReview(false);
        }
    };

    const handleReviewPhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !justSubmittedId) return;

        setUploadingPhoto(true);
        setReviewError("");
        try {
            const body = new FormData();
            body.append("photo", file);
            await api.post(`/reviews/${justSubmittedId}/photos`, body);
            loadReviews();
        } catch (err) {
            setReviewError(extractErrorMessage(err));
        } finally {
            setUploadingPhoto(false);
            e.target.value = "";
        }
    };

    const handleAddToCart = async () => {
        if (!user) {
            navigate("/login");
            return;
        }
        if (user.role !== "buyer") {
            setStatus(t("product.buyerOnlyCart"));
            return;
        }
        if (hasVariants && (!allOptionsSelected || !selectedVariant)) {
            return;
        }

        setStatus("");
        const result = await addToCart(product.id, quantity, selectedVariant?.id || null);
        setStatus(result.success ? t("product.addedToCart") : result.message);
    };

    const handleMessageSeller = async () => {
        if (!user) {
            navigate("/login");
            return;
        }
        if (user.role !== "buyer") {
            setStatus(t("product.buyerOnlyMessage"));
            return;
        }

        try {
            const { data } = await api.post("/chat/conversations", {
                other_user_id: product.seller_id,
                role: "seller",
                product_id: product.id
            });
            navigate(`/messages/${data.data.id}`);
        } catch (err) {
            setStatus(t("product.conversationError"));
        }
    };

    // Share (Phase 2, UI/UX remediation) - native share sheet where
    // available (mobile), falling back to copy-link + toast confirmation,
    // the same pattern Loyalty.jsx's referral link already established.
    const handleShare = async () => {
        const url = window.location.href;
        if (navigator.share) {
            try {
                await navigator.share({ title: product.name, url });
            } catch {
                // Cancelling the native share sheet throws - not an error
                // worth surfacing to the user.
            }
            return;
        }
        try {
            await navigator.clipboard.writeText(url);
            toast?.success(t("product.linkCopied"));
        } catch {
            // Clipboard access can be denied by the browser - rare enough
            // (and low-stakes enough - the URL is still visible in the
            // address bar) not to warrant its own translated error copy.
        }
    };

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
                <div className="grid md:grid-cols-2 gap-10">
                    <div>
                        <Skeleton className="aspect-square w-full mb-3" />
                        <div className="flex gap-2">
                            <Skeleton className="w-16 h-16" />
                            <Skeleton className="w-16 h-16" />
                            <Skeleton className="w-16 h-16" />
                        </div>
                    </div>
                    <div>
                        <Skeleton className="h-3 w-24 mb-3" />
                        <Skeleton className="h-8 w-3/4 mb-4" />
                        <Skeleton className="h-4 w-32 mb-6" />
                        <Skeleton className="h-7 w-28 mb-6" />
                        <Skeleton className="h-4 w-full mb-2" />
                        <Skeleton className="h-4 w-5/6 mb-6" />
                        <Skeleton className="h-11 w-40" />
                    </div>
                </div>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="max-w-6xl mx-auto px-6 py-16 text-center">
                <p className="font-display text-2xl mb-2">{t("product.notFoundTitle")}</p>
                <Link to="/" className="text-teal hover:underline text-sm">{t("common.browseMarketplace")}</Link>
            </div>
        );
    }

    const hasDiscount = product.discount_price && Number(product.discount_price) < Number(product.price);
    const images = product.images?.length ? product.images : [{ image_url: null }];

    // Variants (Phase 2 continuation, UI/UX remediation).
    const variantOptions = product.options || [];
    const hasVariants = variantOptions.length > 0;
    const allOptionsSelected = hasVariants && variantOptions.every((opt) => selectedOptions[opt.name]);
    const selectedVariant = allOptionsSelected
        ? (product.variants || []).find((v) =>
            variantOptions.every((opt) => v.options[opt.name] === selectedOptions[opt.name])
        )
        : null;
    // Effective price/stock for the selector state: before every axis is
    // picked there's nothing purchasable yet, so Add to Cart stays
    // disabled (see the button below) rather than falling back to the
    // parent product's own price/stock, which would be misleading for a
    // product that has variants configured.
    const effectivePrice = hasVariants
        ? (selectedVariant ? Number(product.price) + Number(selectedVariant.price_delta || 0) : null)
        : (hasDiscount ? product.discount_price : product.price);
    const effectiveStock = hasVariants ? (selectedVariant?.stock ?? 0) : product.stock;

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta
                title={product.name}
                description={product.description ? product.description.slice(0, 160) : `${product.name} on NEXORA — ${format(hasDiscount ? product.discount_price : product.price)}`}
                image={images[0]?.image_url}
                type="product"
            />
            <Breadcrumbs
                items={[
                    { label: t("nav.home"), href: "/" },
                    ...(product.category_slug
                        ? [{ label: product.category_name, href: `/departments/${product.category_slug}` }]
                        : []),
                    { label: product.name }
                ]}
            />
            <div className="grid md:grid-cols-2 gap-10">
                <div>
                    <div className="aspect-square bg-line/40 rounded-lg overflow-hidden mb-3">
                        {images[activeImage]?.image_url ? (
                            <button
                                type="button"
                                onClick={() => setLightboxSrc(images[activeImage].image_url)}
                                className="w-full h-full cursor-zoom-in focus-ring"
                                aria-label={t("product.openFullImage")}
                            >
                                <img src={images[activeImage].image_url} alt={product.name} className="w-full h-full object-cover" />
                            </button>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-ash text-sm">{t("product.noImage")}</div>
                        )}
                    </div>
                    {images.length > 1 && (
                        <div className="flex gap-2">
                            {images.map((img, i) => (
                                <button
                                    key={img.id || i}
                                    onClick={() => setActiveImage(i)}
                                    className={`w-16 h-16 rounded-md overflow-hidden border-2 focus-ring ${
                                        i === activeImage ? "border-mango" : "border-transparent"
                                    }`}
                                >
                                    {img.image_url && <img src={img.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                                </button>
                            ))}
                        </div>
                    )}
                    {product.videos?.length > 0 && (
                        <div className="mt-6">
                            <h2 className="font-display text-lg mb-3">{product.videos.length > 1 ? t("product.videoTitleMany") : t("product.videoTitleOne")}</h2>
                            <div className="space-y-3">
                                {product.videos.map((vid) => (
                                    <video key={vid.id} src={vid.video_url} controls
                                        className="w-full rounded-lg border border-line" />
                                ))}
                            </div>
                        </div>
                    )}
                    {product.audio?.length > 0 && (
                        <div className="mt-6">
                            <h2 className="font-display text-lg mb-3">{t("product.audioTitle")}</h2>
                            <div className="space-y-3">
                                {product.audio.map((clip) => (
                                    <audio key={clip.id} src={clip.audio_url} controls className="w-full" />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div>
                    <p className="text-xs uppercase tracking-wide text-ash mb-2">
                        <Link to={`/stores/${product.store_slug}`} className="hover:underline hover:text-ink">
                            {product.store_name}
                        </Link>
                        {product.is_verified ? ` · ✓ ${t("product.verifiedStore")}` : ""}
                    </p>
                    <div className="flex items-start justify-between gap-3 mb-3">
                        <h1 className="font-display text-3xl">{product.name}</h1>
                        <div className="flex items-center gap-1 shrink-0 pt-1">
                            {user?.role === "buyer" && (
                                <button
                                    type="button"
                                    onClick={() => wishlist?.toggle(product.id)}
                                    aria-label={wishlist?.isSaved(product.id) ? t("product.removeFromWishlist") : t("product.saveToWishlist")}
                                    aria-pressed={wishlist?.isSaved(product.id)}
                                    className="w-9 h-9 rounded-full border border-line flex items-center justify-center hover:border-ink transition-colors focus-ring"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill={wishlist?.isSaved(product.id) ? "#e4572e" : "none"}
                                        stroke={wishlist?.isSaved(product.id) ? "#e4572e" : "currentColor"}
                                        strokeWidth="2"
                                        className="w-4 h-4"
                                    >
                                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
                                    </svg>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleShare}
                                aria-label={t("product.share")}
                                className="w-9 h-9 rounded-full border border-line flex items-center justify-center hover:border-ink transition-colors focus-ring"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                                    <circle cx="18" cy="5" r="3" />
                                    <circle cx="6" cy="12" r="3" />
                                    <circle cx="18" cy="19" r="3" />
                                    <path d="M8.6 10.5 15.4 6.5M8.6 13.5l6.8 4" strokeLinecap="round" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {reviews?.average_rating && (
                        <p className="text-sm text-ash mb-4">
                            ★ {reviews.review_count === 1
                                ? t("reviews.summaryOne", { rating: reviews.average_rating })
                                : t("reviews.summaryMany", { rating: reviews.average_rating, count: reviews.review_count })}
                        </p>
                    )}

                    <div className="flex items-baseline gap-3 mb-2">
                        {effectivePrice !== null ? (
                            <span className="price text-2xl font-medium">{format(effectivePrice)}</span>
                        ) : (
                            <span className="text-ash text-sm">{t("product.selectOptionForPrice")}</span>
                        )}
                        {!hasVariants && hasDiscount && (
                            <span className="price text-ash line-through">{format(product.price)}</span>
                        )}
                    </div>

                    {/* Delivery estimate / return policy summary (Phase 2,
                        UI/UX remediation) - previously this only appeared
                        at checkout, after the buyer had already committed
                        to buying. Falls back to a generic platform default
                        when the seller hasn't set a product-specific value
                        (see migration 094's comment on why these are
                        nullable). */}
                    <p className="text-xs text-ash mb-6">
                        {t("product.shipsWithin", { days: product.ships_within_days || 3 })}
                        {" · "}
                        {t("product.returnWindow", { days: product.return_window_days || 7 })}
                    </p>

                    <p className="text-sm text-ink/80 leading-relaxed mb-6 whitespace-pre-line">
                        {product.description || t("product.noDescription")}
                    </p>

                    <dl className="text-sm text-ash grid grid-cols-2 gap-y-1 mb-6 max-w-xs">
                        {product.brand && (<><dt>{t("product.brand")}</dt><dd className="text-ink">{product.brand}</dd></>)}
                        <dt>{t("product.condition")}</dt><dd className="text-ink capitalize">{product.product_condition}</dd>
                        <dt>{t("product.category")}</dt><dd className="text-ink">{product.category_name || "—"}</dd>
                        <dt>{t("product.inStock")}</dt><dd className="text-ink">{product.stock}</dd>
                    </dl>

                    {hasVariants && (
                        <div className="mb-4 space-y-3">
                            {variantOptions.map((opt) => (
                                <div key={opt.id}>
                                    <p className="text-xs font-medium text-ink mb-1.5">{opt.name}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {opt.values.map((val) => {
                                            const active = selectedOptions[opt.name] === val.value;
                                            return (
                                                <button
                                                    key={val.id}
                                                    type="button"
                                                    onClick={() => setSelectedOptions((prev) => ({ ...prev, [opt.name]: val.value }))}
                                                    aria-pressed={active}
                                                    className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                                                        active ? "border-ink bg-ink text-paper" : "border-line hover:border-ash"
                                                    }`}
                                                >
                                                    {val.value}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {(hasVariants ? effectiveStock > 0 || !allOptionsSelected : Number(product.stock) > 0) ? (
                        <div className="mb-3">
                            {allOptionsSelected && effectiveStock > 0 && effectiveStock <= 5 && (
                                <p className="text-xs text-mango-dark font-medium mb-2">
                                    {t("product.onlyLeftInStock", { count: effectiveStock })}
                                </p>
                            )}
                            {allOptionsSelected && effectiveStock === 0 && (
                                <p className="text-coral font-medium mb-2">{t("product.outOfStock")}</p>
                            )}
                            <div className="flex items-center gap-3">
                                <QuantityStepper
                                    value={quantity}
                                    onChange={setQuantity}
                                    min={1}
                                    max={Math.max(effectiveStock, 1)}
                                />
                                <Button
                                    onClick={handleAddToCart}
                                    disabled={hasVariants && (!allOptionsSelected || effectiveStock === 0)}
                                >
                                    {t("product.addToCart")}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="mb-3">
                            <p className="text-coral font-medium mb-2">{t("product.outOfStock")}</p>
                            {!hasVariants && user?.role === "buyer" && (
                                <button
                                    type="button"
                                    onClick={() => toggleAlert("back_in_stock")}
                                    disabled={alertBusy === "back_in_stock"}
                                    className={`text-sm px-3 py-1.5 rounded-md border transition-colors disabled:opacity-60 ${
                                        alertSubs.includes("back_in_stock") ? "border-teal text-teal bg-teal/5" : "border-line hover:border-ink"
                                    }`}
                                >
                                    {alertSubs.includes("back_in_stock") ? `🔔 ${t("product.alertBackInStockOn")}` : `🔔 ${t("product.alertBackInStock")}`}
                                </button>
                            )}
                        </div>
                    )}

                    {user?.role === "buyer" && (
                        <button
                            type="button"
                            onClick={() => toggleAlert("price_drop")}
                            disabled={alertBusy === "price_drop"}
                            className={`text-xs mb-3 block ${alertSubs.includes("price_drop") ? "text-teal" : "text-ash hover:text-ink"} disabled:opacity-60`}
                        >
                            {alertSubs.includes("price_drop") ? `🔔 ${t("product.alertPriceDropOn")}` : `🔔 ${t("product.alertPriceDrop")}`}
                        </button>
                    )}

                    {status && <p className="text-sm text-teal">{status}</p>}

                    <button
                        onClick={handleMessageSeller}
                        className="mt-3 border border-line px-5 py-2.5 rounded-md text-sm font-medium hover:border-abyss transition-colors focus-ring"
                    >
                        💬 {t("product.messageSeller", { seller: product.store_name || t("product.defaultSeller") })}
                    </button>
                </div>
            </div>

            <section className="mt-16 max-w-2xl">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                    <h2 className="font-display text-xl">{t("reviews.title")}</h2>
                    {reviews?.review_count > 0 && (
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

                <RatingBreakdown breakdown={reviews?.rating_breakdown} reviewCount={reviews?.review_count} />

                {user?.role === "buyer" && !showReviewForm && (
                    <button
                        onClick={() => setShowReviewForm(true)}
                        className="text-sm text-teal hover:underline mb-4"
                    >
                        {t("reviews.writeReview")}
                    </button>
                )}

                {showReviewForm && !justSubmittedId && (
                    <form onSubmit={handleReviewSubmit} className="border border-line rounded-lg p-4 mb-6">
                        <label className="block text-sm mb-1">{t("reviews.ratingLabel")}</label>
                        <select
                            value={reviewRating}
                            onChange={(e) => setReviewRating(Number(e.target.value))}
                            className="border border-line rounded-md px-3 py-2 text-sm mb-3 focus-ring"
                        >
                            {[5, 4, 3, 2, 1].map((n) => (
                                <option key={n} value={n}>{n === 1 ? t("reviews.starsOne") : t("reviews.starsMany", { count: n })}</option>
                            ))}
                        </select>
                        <label className="block text-sm mb-1">{t("reviews.commentLabel")}</label>
                        <textarea
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            maxLength={1000}
                            rows={3}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm mb-3 focus-ring"
                        />
                        {reviewError && <p className="text-sm text-coral mb-3">{reviewError}</p>}
                        <div className="flex gap-3">
                            <Button
                                type="submit"
                                disabled={submittingReview}
                                size="sm"
                            >
                                {submittingReview ? t("reviews.submitting") : t("reviews.submit")}
                            </Button>
                            <button
                                type="button"
                                onClick={() => setShowReviewForm(false)}
                                className="text-sm text-ash hover:underline"
                            >
                                {t("common.cancel")}
                            </button>
                        </div>
                    </form>
                )}

                {justSubmittedId && (
                    <div className="border border-line rounded-lg p-4 mb-6">
                        <p className="text-sm text-teal mb-3">{t("reviews.thanks")}</p>
                        {(() => {
                            const submitted = reviews?.reviews?.find((r) => r.id === justSubmittedId);
                            const photoCount = submitted?.photos?.length || 0;
                            return photoCount < MAX_REVIEW_PHOTOS ? (
                                <label className="inline-block text-sm border border-line px-4 py-2 rounded-md cursor-pointer hover:border-ink transition-colors">
                                    {uploadingPhoto ? t("reviews.uploading") : t("reviews.addPhoto")}
                                    <input type="file" accept="image/*" onChange={handleReviewPhotoUpload} disabled={uploadingPhoto} className="hidden" />
                                </label>
                            ) : (
                                <p className="text-ash text-xs">{t("reviews.maxPhotos", { count: MAX_REVIEW_PHOTOS })}</p>
                            );
                        })()}
                        {reviewError && <p className="text-sm text-coral mt-3">{reviewError}</p>}
                    </div>
                )}

                {!reviews?.reviews?.length && <p className="text-ash text-sm">{t("reviews.none")}</p>}
                <ul className="space-y-4">
                    {reviews?.reviews?.map((r) => (
                        <li key={r.id} className="border-b border-line pb-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Avatar firstName={r.first_name} lastName={r.last_name} src={r.photo_url} size="sm" />
                                <div className="flex-1 flex justify-between items-baseline">
                                    <p className="font-medium text-sm">{r.first_name} {r.last_name}</p>
                                    <p className="text-xs text-ash">{formatDate(r.created_at)}</p>
                                </div>
                            </div>
                            <p className="text-sm text-ash mb-1">★ {r.rating}/5</p>
                            {r.comment && <p className="text-sm text-ink/80">{r.comment}</p>}
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
            </section>

            <ProductQA productId={product.id} />

            <RecommendedProducts endpoint={`/recommendations/related/${slug}`} title={t("product.youMayAlsoLike")} />

            <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
        </div>
    );
}
