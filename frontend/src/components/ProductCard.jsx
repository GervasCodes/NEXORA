import { memo, useState } from "react";
import { Link } from "react-router-dom";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import { useWishlist } from "../context/WishlistContext";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { useDataSaver } from "../context/DataSaverContext";
import { useLanguage } from "../context/LanguageContext";
import Button from "./ui/Button";
import VerificationBadge from "./VerificationBadge";
import { imageSrcSet } from "../utils/imageVariants";

const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const CARD_SIZES = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw";
// 44px hit area; the visible circle is drawn inside it.
const SAVE_BUTTON = "absolute top-3 right-2 z-10 w-11 h-11 flex items-center justify-center";

function HeartIcon({ filled }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill={filled ? "#e4572e" : "none"}
            stroke={filled ? "#e4572e" : "currentColor"}
            strokeWidth="2"
            className="w-3.5 h-3.5"
            aria-hidden="true"
        >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
        </svg>
    );
}

function ProductCard({ product, priority = false, layout = "grid" }) {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const { user } = useAuth();
    const wishlist = useWishlist();
    const cart = useCart();
    const toast = useToast();
    const dataSaver = useDataSaver();
    const isList = layout === "list";
    const hasDiscount = product.discount_price && Number(product.discount_price) < Number(product.price);
    const discountPct = hasDiscount ? Math.round((1 - Number(product.discount_price) / Number(product.price)) * 100) : 0;
    const stock = Number(product.stock);
    const saved = wishlist?.isSaved(product.id);
    const isNew = Boolean(product.created_at) && Date.now() - new Date(product.created_at).getTime() < NEW_WINDOW_MS;
    const isGuest = !user;
    // Guests are sent to sign in and come back to this product.
    const loginHref = (intent) => `/login?returnTo=${encodeURIComponent(`/products/${product.slug}`)}&intent=${intent}`;
    const hasVideo = product.has_video || product.videos?.length > 0;
    const [adding, setAdding] = useState(false);

    const handleToggleSave = () => wishlist?.toggle(product.id);

    const handleAddToCart = async (e) => {
        // Save/add-to-cart sit beside the <Link>, not inside it - but the
        // button is still painted on top of the card, so a click needs to
        // be stopped from falling through to the Link's own navigation.
        e.preventDefault();
        if (adding || stock === 0) return;

        setAdding(true);
        const result = await cart?.addToCart(product.id, 1);
        setAdding(false);

        if (result?.success) {
            toast?.success(t("products.feedAddedToCart", { name: product.name }));
        } else {
            toast?.error(result?.message || t("products.feedAddFailed"));
        }
    };

    const media = (
        <div className="bg-line/40 rounded-md overflow-hidden relative aspect-square mb-3">
            {product.image_url ? (
                <img
                    src={dataSaver?.optimize(product.image_url) || product.image_url}
                    srcSet={imageSrcSet(product.image_url)}
                    sizes={CARD_SIZES}
                    alt={product.name}
                    width={400}
                    height={400}
                    loading={priority ? "eager" : "lazy"}
                    fetchPriority={priority ? "high" : "auto"}
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-ash text-xs">
                    {t("products.noImage")}
                </div>
            )}

            <VerificationBadge entity={product} corner="top-left" />

            {hasDiscount && (
                <span className="absolute bottom-2 right-2 bg-coral text-frost text-[11px] font-semibold rounded-full px-2 py-0.5">
                    -{discountPct}%
                </span>
            )}

            {/* Video cue. Driven by has_video / first_video_url from the list response. */}
            {hasVideo && (
                <span
                    role="img"
                    aria-label={t("products.feedVideo")}
                    className="absolute bottom-2 left-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3" aria-hidden="true">
                        <path d="M8 5v14l11-7L8 5Z" />
                    </svg>
                </span>
            )}
        </div>
    );

    const storeLine = (
        <p className="text-xs text-ash uppercase tracking-wide mb-1 flex items-center gap-1">
            <span className="truncate min-w-0">{product.store_name}</span>
            {product.region && (
                <span className="normal-case tracking-normal text-ash flex items-center gap-0.5 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-2.5 h-2.5 shrink-0" aria-hidden="true">
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
            {isNew && (
                <span className="ml-auto text-[11px] font-semibold text-teal">{t("products.newBadge")}</span>
            )}
        </div>
    );

    const ratingAndStock = (
        <div className="flex items-center justify-between mt-1">
            {product.average_rating ? (
                <p className="text-xs text-ash flex items-center gap-0.5">
                    <span className="text-mango">★</span> {Number(product.average_rating).toFixed(1)}
                    <span className="text-ash">({product.review_count})</span>
                </p>
            ) : <span />}

            {stock === 0 ? (
                <p className="text-xs text-coral font-medium">{t("products.outOfStock")}</p>
            ) : stock <= 5 ? (
                <p className="text-xs text-mango-dark font-medium">{t("products.onlyLeft", { count: stock })}</p>
            ) : null}
        </div>
    );

    // Save: buyers only. Guests are sent to sign in via the add-to-cart
    // CTA itself instead of duplicating a second sign-in affordance here.
    // Sellers see neither.
    const saveButton = user?.role === "buyer" && (
        <button
            type="button"
            onClick={handleToggleSave}
            aria-label={saved ? t("products.feedRemoveSaved") : t("products.feedSave")}
            aria-pressed={!!saved}
            className={SAVE_BUTTON}
        >
            <span className="w-7 h-7 rounded-full glass-strong flex items-center justify-center hover:scale-110 transition-transform"><HeartIcon filled={!!saved} /></span>
        </button>
    );

    // List rows are dense (search results, "Browse all" list view) - the
    // add-to-cart CTA is omitted there entirely rather than cramped into a
    // row; shoppers add from the product page instead. Grid tiles keep it.
    const addToCartButton = !isList && (isGuest || user?.role === "buyer") && (
        isGuest ? (
            <Link
                to={loginHref("add-to-cart")}
                className="mt-2 flex w-full min-h-[44px] items-center justify-center rounded-md border border-ink text-sm font-medium hover:bg-ink hover:text-paper transition-colors"
            >
                {t("products.feedAddToCart")}
            </Link>
        ) : (
            <Button
                type="button"
                onClick={handleAddToCart}
                disabled={adding || stock === 0}
                size="sm"
                className="w-full mt-2 min-h-[44px]"
            >
                {adding ? "…" : "Add to cart"}
            </Button>
        )
    );

    const details = (
        <div className={isList ? "flex-1 min-w-0" : undefined}>
            {storeLine}
            <h3 className="text-sm font-medium leading-snug line-clamp-2 mb-2">{product.name}</h3>
            {priceRow}
            {ratingAndStock}
        </div>
    );

    // Save and add-to-cart sit beside the link, not inside it, so there are
    // no nested interactive elements.
    return (
        <div className={`tag-string group relative bg-paper border border-line rounded-lg transition-all ${
            isList ? "flex gap-3 p-3" : "block pt-4 px-3 pb-3 hover:shadow-md hover:-translate-y-0.5"
        }`}>
            <Link to={`/products/${product.slug}`} className={isList ? "flex gap-3 flex-1 min-w-0" : "block"}>
                {isList ? <div className="w-20 shrink-0">{media}</div> : media}
                {isList ? details : (
                    <>
                        {storeLine}
                        <h3 className="text-sm font-medium leading-snug line-clamp-2 mb-2">{product.name}</h3>
                        {priceRow}
                        {ratingAndStock}
                    </>
                )}
            </Link>
            {saveButton}
            {addToCartButton}
        </div>
    );
}

export default memo(ProductCard);
