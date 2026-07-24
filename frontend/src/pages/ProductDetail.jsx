import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";
import RatingBreakdown from "../components/RatingBreakdown";

export default function ProductDetail() {
    const { format } = useCurrency();
    const { slug } = useParams();
    const { user } = useAuth();
    const { addToCart } = useCart();
    const navigate = useNavigate();

    const [product, setProduct] = useState(null);
    const [reviews, setReviews] = useState(null);
    const [reviewSort, setReviewSort] = useState("newest");
    const [activeImage, setActiveImage] = useState(0);
    const [quantity, setQuantity] = useState(1);
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(true);

    // Phase 6C - review submission. There was previously no way for a
    // buyer to write a review anywhere in the frontend even though the
    // backend has always supported it; this is the minimal form that
    // makes the rest of this phase's "enhanced" review features
    // (photos, seller replies, sorting) actually reachable.
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [reviewRating, setReviewRating] = useState(5);
    const [reviewComment, setReviewComment] = useState("");
    const [submittingReview, setSubmittingReview] = useState(false);
    const [reviewError, setReviewError] = useState("");
    const [justSubmittedId, setJustSubmittedId] = useState(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    // Kept in sync with the backend's MAX_PHOTOS_PER_REVIEW
    // (review.service.js), same reasoning SellerProductForm.jsx's
    // MAX_VIDEOS/MAX_AUDIO constants already give for their caps.
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
            setStatus("Only buyer accounts can add items to a cart.");
            return;
        }

        setStatus("");
        const result = await addToCart(product.id, quantity);
        setStatus(result.success ? "Added to cart." : result.message);
    };

    const handleMessageSeller = async () => {
        if (!user) {
            navigate("/login");
            return;
        }
        if (user.role !== "buyer") {
            setStatus("Only buyer accounts can message sellers.");
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
            setStatus("Couldn't start a conversation. Please try again.");
        }
    };

    if (loading) {
        return <div className="max-w-6xl mx-auto px-6 py-16 text-ash">Loading…</div>;
    }

    if (!product) {
        return (
            <div className="max-w-6xl mx-auto px-6 py-16 text-center">
                <p className="font-display text-2xl mb-2">Product not found</p>
                <Link to="/" className="text-teal hover:underline text-sm">Back to marketplace</Link>
            </div>
        );
    }

    const hasDiscount = product.discount_price && Number(product.discount_price) < Number(product.price);
    const images = product.images?.length ? product.images : [{ image_url: null }];

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
            <div className="grid md:grid-cols-2 gap-10">
                <div>
                    <div className="aspect-square bg-line/40 rounded-lg overflow-hidden mb-3">
                        {images[activeImage]?.image_url ? (
                            <img src={images[activeImage].image_url} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-ash text-sm">No image</div>
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
                            <h2 className="font-display text-lg mb-3">Product video{product.videos.length > 1 ? "s" : ""}</h2>
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
                            <h2 className="font-display text-lg mb-3">Product audio</h2>
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
                        {product.is_verified ? " · ✓ Verified store" : ""}
                    </p>
                    <h1 className="font-display text-3xl mb-3">{product.name}</h1>

                    {reviews?.average_rating && (
                        <p className="text-sm text-ash mb-4">
                            ★ {reviews.average_rating} average · {reviews.review_count} review{reviews.review_count === 1 ? "" : "s"}
                        </p>
                    )}

                    <div className="flex items-baseline gap-3 mb-6">
                        <span className="price text-2xl font-medium">
                            {format(hasDiscount ? product.discount_price : product.price)}
                        </span>
                        {hasDiscount && (
                            <span className="price text-ash line-through">{format(product.price)}</span>
                        )}
                    </div>

                    <p className="text-sm text-ink/80 leading-relaxed mb-6 whitespace-pre-line">
                        {product.description || "No description provided."}
                    </p>

                    <dl className="text-sm text-ash grid grid-cols-2 gap-y-1 mb-6 max-w-xs">
                        {product.brand && (<><dt>Brand</dt><dd className="text-ink">{product.brand}</dd></>)}
                        <dt>Condition</dt><dd className="text-ink capitalize">{product.product_condition}</dd>
                        <dt>Category</dt><dd className="text-ink">{product.category_name || "—"}</dd>
                        <dt>In stock</dt><dd className="text-ink">{product.stock}</dd>
                    </dl>

                    {Number(product.stock) > 0 ? (
                        <div className="flex items-center gap-3 mb-3">
                            <input
                                type="number"
                                min="1"
                                max={product.stock}
                                value={quantity}
                                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                                className="w-20 border border-line rounded-md px-3 py-2 text-sm focus-ring"
                            />
                            <button
                                onClick={handleAddToCart}
                                className="bg-mango text-abyss px-6 py-2.5 rounded-md font-medium hover:bg-mango-dark transition-colors focus-ring"
                            >
                                Add to cart
                            </button>
                        </div>
                    ) : (
                        <p className="text-coral font-medium mb-3">Out of stock</p>
                    )}

                    {status && <p className="text-sm text-teal">{status}</p>}

                    <button
                        onClick={handleMessageSeller}
                        className="text-sm text-azure-deep hover:underline mt-3 inline-block"
                    >
                        💬 Message {product.store_name || "seller"}
                    </button>
                </div>
            </div>

            <section className="mt-16 max-w-2xl">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                    <h2 className="font-display text-xl">Reviews</h2>
                    {reviews?.review_count > 0 && (
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

                <RatingBreakdown breakdown={reviews?.rating_breakdown} reviewCount={reviews?.review_count} />

                {user?.role === "buyer" && !showReviewForm && (
                    <button
                        onClick={() => setShowReviewForm(true)}
                        className="text-sm text-teal hover:underline mb-4"
                    >
                        Write a review
                    </button>
                )}

                {showReviewForm && !justSubmittedId && (
                    <form onSubmit={handleReviewSubmit} className="border border-line rounded-lg p-4 mb-6">
                        <label className="block text-sm mb-1">Rating</label>
                        <select
                            value={reviewRating}
                            onChange={(e) => setReviewRating(Number(e.target.value))}
                            className="border border-line rounded-md px-3 py-2 text-sm mb-3 focus-ring"
                        >
                            {[5, 4, 3, 2, 1].map((n) => (
                                <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>
                            ))}
                        </select>
                        <label className="block text-sm mb-1">Comment (optional)</label>
                        <textarea
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            maxLength={1000}
                            rows={3}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm mb-3 focus-ring"
                        />
                        {reviewError && <p className="text-sm text-coral mb-3">{reviewError}</p>}
                        <div className="flex gap-3">
                            <button
                                type="submit"
                                disabled={submittingReview}
                                className="bg-mango text-abyss px-5 py-2 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-50"
                            >
                                {submittingReview ? "Submitting…" : "Submit review"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowReviewForm(false)}
                                className="text-sm text-ash hover:underline"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                )}

                {justSubmittedId && (
                    <div className="border border-line rounded-lg p-4 mb-6">
                        <p className="text-sm text-teal mb-3">Thanks for your review!</p>
                        {(() => {
                            const submitted = reviews?.reviews?.find((r) => r.id === justSubmittedId);
                            const photoCount = submitted?.photos?.length || 0;
                            return photoCount < MAX_REVIEW_PHOTOS ? (
                                <label className="inline-block text-sm border border-line px-4 py-2 rounded-md cursor-pointer hover:border-ink transition-colors">
                                    {uploadingPhoto ? "Uploading…" : "+ Add a photo"}
                                    <input type="file" accept="image/*" onChange={handleReviewPhotoUpload} disabled={uploadingPhoto} className="hidden" />
                                </label>
                            ) : (
                                <p className="text-ash text-xs">Maximum of {MAX_REVIEW_PHOTOS} photos per review.</p>
                            );
                        })()}
                        {reviewError && <p className="text-sm text-coral mt-3">{reviewError}</p>}
                    </div>
                )}

                {!reviews?.reviews?.length && <p className="text-ash text-sm">No reviews yet.</p>}
                <ul className="space-y-4">
                    {reviews?.reviews?.map((r) => (
                        <li key={r.id} className="border-b border-line pb-4">
                            <div className="flex justify-between items-baseline mb-1">
                                <p className="font-medium text-sm">{r.first_name} {r.last_name}</p>
                                <p className="text-xs text-ash">{formatDate(r.created_at)}</p>
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
                                    <p className="text-xs font-medium text-ink mb-0.5">Seller response</p>
                                    <p className="text-xs text-ink/80">{r.seller_reply}</p>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
