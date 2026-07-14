import { Link } from "react-router-dom";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import { useWishlist } from "../context/WishlistContext";

export default function ProductCard({ product }) {
    const { format } = useCurrency();
    const { user } = useAuth();
    const wishlist = useWishlist();
    const hasDiscount = product.discount_price && Number(product.discount_price) < Number(product.price);
    const stock = Number(product.stock);
    const saved = wishlist?.isSaved(product.id);

    const handleToggleSave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        wishlist?.toggle(product.id);
    };

    return (
        <Link
            to={`/products/${product.slug}`}
            className="tag-string group relative block bg-paper border border-line rounded-lg pt-4 px-3 pb-3 hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
            <div className="aspect-square bg-line/40 rounded-md overflow-hidden mb-3 relative">
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-ash text-xs">
                        No image
                    </div>
                )}

                {/* Save for later - buyers only; hidden for sellers/guests
                    browsing their own or others' catalogs. */}
                {user?.role === "buyer" && (
                    <button
                        type="button"
                        onClick={handleToggleSave}
                        aria-label={saved ? "Remove from saved" : "Save for later"}
                        aria-pressed={saved}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full glass-strong flex items-center justify-center hover:scale-110 transition-transform"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill={saved ? "#e4572e" : "none"}
                            stroke={saved ? "#e4572e" : "currentColor"}
                            strokeWidth="2"
                            className="w-3.5 h-3.5"
                        >
                            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
                        </svg>
                    </button>
                )}

                {product.is_verified === 1 || product.is_verified === true ? (
                    <span className="absolute top-2 left-2 bg-teal text-paper text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
                            <path d="M12 2 4 5v6c0 5.5 3.4 9.7 8 11 4.6-1.3 8-5.5 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 5.1-5.1 1.4 1.4-6.5 6.5Z" />
                        </svg>
                        Verified
                    </span>
                ) : null}
            </div>

            <p className="text-xs text-ash uppercase tracking-wide mb-1 truncate">{product.store_name}</p>
            <h3 className="text-sm font-medium leading-snug line-clamp-2 mb-2">{product.name}</h3>

            <div className="flex items-baseline gap-2">
                <span className="price text-base font-medium text-ink">
                    {format(hasDiscount ? product.discount_price : product.price)}
                </span>
                {hasDiscount && (
                    <span className="price text-xs text-ash line-through">
                        {format(product.price)}
                    </span>
                )}
            </div>

            <div className="flex items-center justify-between mt-1">
                {product.average_rating ? (
                    <p className="text-xs text-ash flex items-center gap-0.5">
                        <span className="text-mango">★</span> {Number(product.average_rating).toFixed(1)}
                        <span className="text-ash/70">({product.review_count})</span>
                    </p>
                ) : <span />}

                {stock === 0 ? (
                    <p className="text-xs text-coral font-medium">Out of stock</p>
                ) : stock <= 5 ? (
                    <p className="text-xs text-mango-dark font-medium">Only {stock} left</p>
                ) : null}
            </div>
        </Link>
    );
}
