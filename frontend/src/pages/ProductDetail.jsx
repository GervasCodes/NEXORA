import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";

export default function ProductDetail() {
    const { format } = useCurrency();
    const { slug } = useParams();
    const { user } = useAuth();
    const { addToCart } = useCart();
    const navigate = useNavigate();

    const [product, setProduct] = useState(null);
    const [reviews, setReviews] = useState(null);
    const [activeImage, setActiveImage] = useState(0);
    const [quantity, setQuantity] = useState(1);
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.get(`/products/${slug}`)
            .then(({ data }) => setProduct(data.data))
            .catch(() => setProduct(null))
            .finally(() => setLoading(false));
    }, [slug]);

    useEffect(() => {
        if (!product) return;
        api.get(`/reviews/product/${product.id}`).then(({ data }) => setReviews(data.data)).catch(() => {});
    }, [product]);

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
                </div>

                <div>
                    <p className="text-xs uppercase tracking-wide text-ash mb-2">
                        {product.store_name} {product.is_verified ? "· ✓ Verified store" : ""}
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
                <h2 className="font-display text-xl mb-4">Reviews</h2>
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
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
