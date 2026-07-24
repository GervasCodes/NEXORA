import { memo, useState } from "react";
import { Link } from "react-router-dom";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import { useWishlist } from "../context/WishlistContext";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";

// Phase 4A: `layout` ("grid" | "list") lets one card component serve both
// the tiled catalog (ProductGrid's default, ProductRow's horizontal strip)
// and a denser list view (ProductGrid's list toggle) without callers
// needing to know the difference - same data, same Link target, same
// actions, just arranged differently. Grid stays the default so every
// existing call site (ProductRow, any page not yet passing `layout`)
// renders exactly as before.
//
// The media block (image, save button, verified badge), the store/
// location line, and the price/rating/stock row are shared between both
// layouts so 4C (extra actions) can extend either without duplicating
// this markup. Rating and the verified badge already existed before
// Phase 4B; 4B added `product.region` to the store line - it's the
// seller's free-text region (set in Store settings), so it's simply
// omitted when a seller hasn't set one, same as the "Location" filter
// dropdown already handles a missing region.
//
// Phase 4C adds the second buyer-only quick action: "Add to cart",
// reusing `CartContext.addToCart` (already used by ProductDetail) so the
// card doesn't reimplement cart logic - it just calls the same function.
// Follows the save button's existing convention of only rendering for
// `user?.role === "buyer"` rather than introducing a new visibility rule.
function ProductCard({ product, layout = "grid" }) {
    const { format } = useCurrency();
    const { user } = useAuth();
    const wishlist = useWishlist();
    const cart = useCart();
    const toast = useToast();
    const hasDiscount = product.discount_price && Number(product.discount_price) < Number(product.price);
    const stock = Number(product.stock);
    const saved = wishlist?.isSaved(product.id);
    const isList = layout === "list";
    const [adding, setAdding] = useState(false);

    const handleToggleSave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        wishlist?.toggle(product.id);
    };

    // Card grid has no room for ProductDetail's inline status line, so
    // feedback goes through the app's existing toast system instead -
    // ToastProvider already wraps the whole app (see main.jsx), it just
    // wasn't used from this component before.
    const handleAddToCart = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (adding || stock === 0) return;

        setAdding(true);
        const result = await cart?.addToCart(product.id, 1);
        setAdding(false);

        if (result?.success) {
            toast?.success(`Added "${product.name}" to cart.`);
        } else {
            toast?.error(result?.message || "Couldn't add to cart. Please try again.");
        }
    };

    const media = (
        <div className={`bg-line/40 rounded-md overflow-hidden relative ${isList ? "w-24 h-24 sm:w-32 sm:h-32 shrink-0" : "aspect-square mb-3"}`}>
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
    );

    const storeLine = (
        <p className="text-xs text-ash uppercase tracking-wide mb-1 flex items-center gap-1">
            <span className="truncate min-w-0">{product.store_name}</span>
            {product.region && (
                <span className="normal-case tracking-normal text-ash/80 flex items-center gap-0.5 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-2.5 h-2.5 shrink-0">
                        <path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21Z" />
                        <circle cx="12" cy="10.5" r="2" />
                    </svg>
                    {product.region}
                </span>
            )}
        </p>
    );

    const priceRow = (
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
    );

    const ratingAndStock = (
        <div className={isList ? "flex items-center gap-3 mt-1" : "flex items-center justify-between mt-1"}>
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
    );

    // Phase 4C: buyer-only, mirrors the save button's visibility rule.
    // Hidden (not just disabled) for out-of-stock items in the list
    // layout where a bare disabled button would sit oddly next to the
    // "Out of stock" text already shown by ratingAndStock; in the grid
    // layout it's shown disabled instead, since a vanished button there
    // would shift the price row up in a way that reads as a layout bug
    // rather than an intentional absence.
    const addToCartButton = user?.role === "buyer" && (isList ? stock > 0 : true) && (
        <button
            type="button"
            onClick={handleAddToCart}
            disabled={adding || stock === 0}
            className={`bg-mango text-abyss font-medium rounded-md hover:bg-mango-dark transition-colors focus-ring disabled:opacity-50 disabled:cursor-not-allowed ${
                isList ? "text-xs px-3 py-1.5 shrink-0 self-center" : "text-xs px-3 py-1.5 w-full mt-2"
            }`}
        >
            {adding ? "Adding…" : "Add to cart"}
        </button>
    );

    if (isList) {
        return (
            <Link
                to={`/products/${product.slug}`}
                className="tag-string group relative flex gap-4 bg-paper border border-line rounded-lg p-3 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
                {media}

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    {storeLine}
                    <h3 className="text-sm font-medium leading-snug line-clamp-2 mb-2">{product.name}</h3>
                    {priceRow}
                    {ratingAndStock}
                </div>

                {addToCartButton}
            </Link>
        );
    }

    return (
        <Link
            to={`/products/${product.slug}`}
            className="tag-string group relative block bg-paper border border-line rounded-lg pt-4 px-3 pb-3 hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
            {media}

            {storeLine}
            <h3 className="text-sm font-medium leading-snug line-clamp-2 mb-2">{product.name}</h3>

            {priceRow}
            {ratingAndStock}
            {addToCartButton}
        </Link>
    );
}

export default memo(ProductCard);
