import { Component, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import api from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { useDataSaver } from "../context/DataSaverContext";
import { pickFeedMedia } from "../utils/feedMedia";
import { useAuth } from "../context/AuthContext";
import { useWishlist } from "../context/WishlistContext";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";

const HEART_PATH = "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z";
const SHARE_PATH = "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13";
const CART_PATH = "M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6";
const STORE_PATH = "M4 9h16l-1-5H5L4 9Zm1 0v11h14V9";
const RAIL_BTN = "w-11 h-11 rounded-full bg-black/40 backdrop-blur flex items-center justify-center";

// Right-side action rail: save, share, add to cart, visit store, rating.
// Guests get sign-in links (with a return URL) instead of save/cart.
function FeedActionRail({ product, saved, isGuest, loginHref, showCart, adding, onSave, onShare, onCart }) {
    const { t } = useLanguage();
    const icon = (d, filled = false) => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="w-5 h-5" aria-hidden="true">
            <path d={d} />
        </svg>
    );
    return (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-3">
            {isGuest ? (
                <Link to={loginHref} aria-label={t("products.feedSignIn")} className={RAIL_BTN}>{icon(HEART_PATH)}</Link>
            ) : (
                <button type="button" onClick={onSave} aria-label={saved ? t("products.feedRemoveSaved") : t("products.feedSave")} aria-pressed={!!saved} className={`${RAIL_BTN} ${saved ? "text-coral" : ""}`}>
                    {icon(HEART_PATH, !!saved)}
                </button>
            )}
            <button type="button" onClick={onShare} aria-label={t("products.feedShare")} className={RAIL_BTN}>{icon(SHARE_PATH)}</button>
            {showCart && (isGuest ? (
                <Link to={loginHref} aria-label={t("products.feedSignIn")} className={RAIL_BTN}>{icon(CART_PATH)}</Link>
            ) : (
                <button type="button" onClick={onCart} disabled={adding} aria-label={t("products.feedAddToCart")} className={`${RAIL_BTN} disabled:opacity-50`}>{icon(CART_PATH)}</button>
            ))}
            {product.store_slug && (
                <Link to={`/stores/${product.store_slug}`} aria-label={t("products.feedVisitStore")} className={RAIL_BTN}>{icon(STORE_PATH)}</Link>
            )}
            {product.average_rating ? (
                <p className="text-[11px] text-frost bg-black/40 rounded-full px-2 py-1">★ {Number(product.average_rating).toFixed(1)}</p>
            ) : null}
        </div>
    );
}

// Start fetching the next page once the shopper is this many slides from
// the end of what's loaded, so the next screen is usually ready before
// they swipe to it.
export const LOAD_AHEAD = 3;

// Same "flaky mobile connection" bug class already fixed in ProductGrid.jsx
// (REQUEST_TIMEOUT_MS) - this lookup had no timeout of its own, so a stalled
// request here (ERR_QUIC_PROTOCOL_ERROR / QUIC_NETWORK_IDLE_TIMEOUT per
// production logs) could hang indefinitely instead of falling back cleanly.
const VIDEO_LOOKUP_TIMEOUT_MS = 8000;

// Bug fix: previously, a slide whose product hit an unexpected render error
// (a malformed record, a rejected image decode some browsers surface as a
// thrown error, etc.) had nothing catching it - React unmounts the nearest
// tree on an uncaught render error, which for this component meant losing
// the whole feed (including the close/counter/filter bar) silently, with
// nothing in production to show what happened. This boundary is scoped to
// one slide at a time so a single bad product can't take the rest down.
class SlideErrorBoundary extends Component {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error) {
        // eslint-disable-next-line no-console -- surfaced to Sentry via the app's global handler; this local log is for local/dev visibility only.
        console.error("ProductSwipeFeed slide failed to render:", error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="absolute inset-0 flex items-center justify-center text-frost/60 text-sm px-6 text-center">
                    Couldn't load this item.
                </div>
            );
        }
        return this.props.children;
    }
}

function prefersReducedMotion() {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function FeedVideo({ src, poster, muted, autoplay }) {
    const ref = useRef(null);

    useEffect(() => {
        if (!autoplay || !ref.current) return;
        try {
            // play() returns a promise in browsers (rejects if autoplay is
            // blocked) but not in every environment - never let it throw.
            ref.current.play?.()?.catch?.(() => {});
        } catch {
            /* autoplay blocked or unsupported - the poster stays visible */
        }
    }, [autoplay, src]);

    return (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- seller-uploaded product videos have no caption/subtitle track available; this is silent b-roll of the product, not narrated content
        <video
            ref={ref}
            src={src}
            poster={poster || undefined}
            muted={muted}
            loop
            playsInline
            autoPlay={autoplay}
            controls={!autoplay}
            preload={autoplay ? "auto" : "none"}
            className="absolute inset-0 w-full h-full object-cover"
        />
    );
}

// Full-screen, one-product-per-screen vertical snap feed - available at
// every viewport width now (Fix Plan 2.2), not just mobile. Purely a
// presentation layer: the product list, pagination state and loadMore all
// belong to ProductGrid, so the feed can't drift from the grid/list views
// for the same query (same array, same page cursor). Each slide is capped
// to a centered, phone-proportioned column at `md`+ (see `md:max-w-[480px]
// md:mx-auto` below) so the image/video doesn't stretch into an absurdly
// wide column on a desktop monitor - the backdrop stays full-bleed black.
export default function ProductSwipeFeed({ products, hasMore, loadingMore, onLoadMore, onClose, onOpenFilters, initialIndex = 0, onIndexChange, filterPanel }) {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const dataSaver = useDataSaver();
    const { user } = useAuth();
    const wishlist = useWishlist();
    const cart = useCart();
    const toast = useToast();
    const location = useLocation();
    const scrollerRef = useRef(null);
    const dialogRef = useRef(null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [addingId, setAddingId] = useState(null);
    const loginHref = `/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`;

    const handleShare = async (product) => {
        const url = `${window.location.origin}/products/${product.slug}`;
        try {
            if (navigator.share) { await navigator.share({ title: product.name, url }); return; }
            await navigator.clipboard.writeText(url);
            toast?.success(t("products.feedLinkCopied"));
        } catch {
            /* share sheet dismissed or clipboard blocked - nothing to report */
        }
    };

    const handleCart = async (product) => {
        setAddingId(product.id);
        const result = await cart?.addToCart(product.id, 1);
        setAddingId(null);
        if (result?.success) toast?.success(t("products.feedAddedToCart", { name: product.name }));
        else toast?.error(result?.message || t("products.feedAddFailed"));
    };
    const closeRef = useRef(null);
    const requestedLenRef = useRef(-1);
    const requestedVideoIds = useRef(new Set());
    const [activeIndex, setActiveIndex] = useState(initialIndex);
    const [videoUrls, setVideoUrls] = useState({});
    const [muted, setMuted] = useState(true);
    // Bug fix: a broken/expired image URL used to just fail silently (the
    // <img> renders nothing, no fallback), which combined with a slow CDN
    // is the most likely way a slide ends up looking fully blank. Track
    // failures per product id so those slides fall back to the same "No
    // image" state as a product with no image at all.
    const [brokenImageIds, setBrokenImageIds] = useState(() => new Set());

    const autoplay = !dataSaver?.enabled && !prefersReducedMotion();

    // Restore the slide the shopper was on (feed-as-a-page, return via Back).
    useEffect(() => {
        if (!initialIndex) return;
        scrollerRef.current?.querySelector(`[data-feed-index="${initialIndex}"]`)?.scrollIntoView({ block: "start" });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
    }, []);

    useEffect(() => { onIndexChange?.(activeIndex); }, [activeIndex, onIndexChange]);

    // Focus trap: focus moves into the feed on open and Tab cycles inside it,
    // so keyboard users can't tab into the page behind the overlay.
    useEffect(() => {
        const node = dialogRef.current;
        if (!node) return undefined;
        const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
        node.querySelector(FOCUSABLE)?.focus();
        const onKeyDown = (e) => {
            if (e.key !== "Tab") return;
            const items = node.querySelectorAll(FOCUSABLE);
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        node.addEventListener("keydown", onKeyDown);
        return () => node.removeEventListener("keydown", onKeyDown);
    }, []);

    // Modal behavior: lock page scroll underneath, Escape closes, focus
    // moves in and is restored to whatever opened the feed.
    useEffect(() => {
        const previouslyFocused = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeRef.current?.focus();

        const onKeyDown = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", onKeyDown);
            previouslyFocused?.focus?.();
        };
    }, [onClose]);

    // Track which slide is on screen.
    useEffect(() => {
        const scroller = scrollerRef.current;
        if (!scroller) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) setActiveIndex(Number(entry.target.dataset.feedIndex));
                }
            },
            { root: scroller, threshold: 0.6 }
        );
        scroller.querySelectorAll("[data-feed-index]").forEach((node) => observer.observe(node));
        return () => observer.disconnect();
    }, [products.length]);

    // Next-page trigger. `requestedLenRef` makes it fire at most once per
    // loaded length: the scroll observer can report the same slide (or a
    // neighbouring one) several times before the parent's loadingMore
    // state flips, and each of those would otherwise be a duplicate fetch.
    // If a request fails the length doesn't change, so it isn't retried
    // automatically - the "Load more" button on the last slide covers that.
    useEffect(() => {
        if (!hasMore || loadingMore) return;
        if (activeIndex < products.length - LOAD_AHEAD) return;
        if (requestedLenRef.current === products.length) return;

        requestedLenRef.current = products.length;
        onLoadMore();
    }, [activeIndex, products.length, hasMore, loadingMore, onLoadMore]);

    // The list endpoint doesn't return videos, so look them up for the
    // current and next slide only (the next one so its video is ready when
    // the shopper swipes). Each product is requested at most once.
    useEffect(() => {
        [activeIndex, activeIndex + 1].forEach((i) => {
            const product = products[i];
            if (!product || product.videos !== undefined || product.first_video_url !== undefined) return;
            if (requestedVideoIds.current.has(product.id)) return;

            requestedVideoIds.current.add(product.id);
            api.get(`/products/${product.slug}`, { timeout: VIDEO_LOOKUP_TIMEOUT_MS })
                .then(({ data }) => {
                    const url = data?.data?.videos?.[0]?.video_url || null;
                    setVideoUrls((prev) => ({ ...prev, [product.id]: url }));
                })
                .catch(() => setVideoUrls((prev) => ({ ...prev, [product.id]: null })));
        });
    }, [activeIndex, products]);

    // Bug fix: every route in App.jsx is wrapped in PageTransition, which
    // renders a <div className="animate-page-in"> whose enter animation
    // ends on `transform: translateY(0)` with fill-mode "both" - so the
    // computed transform never goes back to `none` for as long as that
    // page is mounted. Per spec, any non-`none` transform on an ancestor
    // becomes the containing block for `position: fixed` descendants, so
    // this dialog's `fixed inset-0` was sizing/positioning itself against
    // that (short, content-height) page wrapper instead of the real
    // viewport - not against the actual screen. The close/counter/filter
    // bar sits at the top of that box and so still roughly lined up, but
    // everything below - every slide - was being squeezed into or clipped
    // by a box far shorter than the screen, which is what read as "all of
    // them are blank". Portaling straight to document.body takes this
    // dialog out from under that ancestor entirely.
    return createPortal(
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Product feed" className="fixed inset-0 z-[var(--z-feed)] bg-black text-frost">
            {filtersOpen && filterPanel && (
                <div className="absolute inset-0 z-30 flex items-end md:items-center justify-center bg-black/60" onClick={() => setFiltersOpen(false)}>
                    <div role="dialog" aria-modal="true" aria-label={t("products.feedFilters")} onClick={(e) => e.stopPropagation()} className="w-full md:max-w-md max-h-[80%] overflow-y-auto bg-paper text-ink rounded-t-2xl md:rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-3">
                            <p className="font-medium">{t("products.feedFilters")}</p>
                            <button type="button" onClick={() => setFiltersOpen(false)} aria-label={t("products.feedClose")} className="w-11 h-11 rounded-full border border-line flex items-center justify-center">×</button>
                        </div>
                        {filterPanel}
                    </div>
                </div>
            )}
            <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between gap-3 px-3 pb-6 pt-[calc(0.75rem+env(safe-area-inset-top))] bg-gradient-to-b from-black/60 to-transparent pointer-events-none md:max-w-[480px] md:mx-auto">
                <button
                    ref={closeRef}
                    type="button"
                    onClick={onClose}
                    aria-label={t("products.feedClose")}
                    className="pointer-events-auto w-11 h-11 rounded-full bg-black/40 backdrop-blur flex items-center justify-center"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                </button>

                <button
                    type="button"
                    onClick={() => (filterPanel ? setFiltersOpen((open) => !open) : onOpenFilters?.())}
                    aria-label={t("products.feedFilters")}
                    className="pointer-events-auto w-11 h-11 rounded-full bg-black/40 backdrop-blur flex items-center justify-center"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5" aria-hidden="true">
                        <path d="M4 6h16M7 12h10M10 18h4" />
                    </svg>
                </button>
            </div>

            <div ref={scrollerRef} className="h-full overflow-y-auto snap-y snap-mandatory overscroll-contain">
                {products.map((product, index) => {
                    const media = pickFeedMedia(product, product.first_video_url ?? videoUrls[product.id]);
                    const isActive = index === activeIndex;
                    const isLast = index === products.length - 1;
                    const hasDiscount = product.discount_price && Number(product.discount_price) < Number(product.price);
                    const pct = hasDiscount ? Math.round((1 - Number(product.discount_price) / Number(product.price)) * 100) : 0;
                    const hasVideo = Boolean(product.has_video || product.first_video_url);
                    const imageSrc = media.type === "video" ? media.poster : media.src;
                    const imageFailed = brokenImageIds.has(product.id);

                    return (
                        <SlideErrorBoundary key={product.id}>
                        <section
                            data-feed-index={index}
                            aria-label={product.name}
                            className="snap-start snap-always h-full relative overflow-hidden bg-black md:max-w-[480px] md:mx-auto"
                        >
                            {imageSrc && !imageFailed && (
                                <img aria-hidden="true" alt="" src={imageSrc} loading="lazy" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-50" />
                            )}
                            {media.type === "video" && isActive ? (
                                <FeedVideo src={media.src} poster={media.poster} muted={muted} autoplay={autoplay} />
                            ) : imageSrc && !imageFailed ? (
                                <img
                                    src={dataSaver?.optimize(imageSrc) || imageSrc}
                                    alt={product.name}
                                    loading={Math.abs(index - activeIndex) <= 1 ? "eager" : "lazy"}
                                    decoding="async"
                                    onError={() => setBrokenImageIds((prev) => {
                                        if (prev.has(product.id)) return prev;
                                        const next = new Set(prev);
                                        next.add(product.id);
                                        return next;
                                    })}
                                    className="absolute inset-0 w-full h-full object-contain"
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-frost/50 text-sm">No image</div>
                            )}

                            {media.type === "video" && isActive && autoplay && (
                                <button
                                    type="button"
                                    onClick={() => setMuted((m) => !m)}
                                    aria-label={muted ? t("products.feedUnmute") : t("products.feedMute")}
                                    aria-pressed={!muted}
                                    className="absolute right-3 bottom-40 z-10 w-11 h-11 rounded-full bg-black/40 backdrop-blur flex items-center justify-center"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5" aria-hidden="true">
                                        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                                        {muted ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
                                    </svg>
                                </button>
                            )}

                            <FeedActionRail
                                product={product}
                                saved={wishlist?.isSaved(product.id)}
                                isGuest={!user}
                                loginHref={loginHref}
                                showCart={!user || (user.role === "buyer" && Number(product.stock) > 0)}
                                adding={addingId === product.id}
                                onSave={() => wishlist?.toggle(product.id)}
                                onShare={() => handleShare(product)}
                                onCart={() => handleCart(product)}
                            />

                            <div className="absolute inset-x-0 bottom-0 z-10 px-4 pt-16 pb-[calc(1.5rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-black/85 via-black/40 to-transparent">
                                <div className="flex items-center gap-2 mb-1">
                                    {hasDiscount && <span className="text-[11px] font-semibold bg-coral text-frost rounded-full px-2 py-0.5">-{pct}%</span>}
                                    {hasVideo && <span className="text-[11px] bg-black/50 rounded-full px-2 py-0.5">{t("products.feedVideo")}</span>}
                                </div>
                                {product.store_name && <p className="text-xs uppercase tracking-wide text-frost/70 mb-1 truncate">{product.store_name}</p>}
                                <h3 className="text-lg font-medium leading-snug line-clamp-2 mb-1">{product.name}</h3>
                                <div className="flex items-baseline gap-2 mb-3">
                                    <span className="price text-lg font-semibold">{format(hasDiscount ? product.discount_price : product.price)}</span>
                                    {hasDiscount && <span className="price text-sm text-frost/60 line-through">{format(product.price)}</span>}
                                </div>
                                <Link
                                    to={`/products/${product.slug}`}
                                    className="inline-flex items-center justify-center h-11 px-5 rounded-full bg-mango text-abyss text-sm font-semibold"
                                >
                                    {t("products.feedViewProduct")}
                                </Link>

                                {isLast && hasMore && !loadingMore && (
                                    <button type="button" onClick={onLoadMore} className="ml-3 h-11 px-4 text-sm text-frost/80 underline">
                                        Load more
                                    </button>
                                )}
                                {isLast && loadingMore && <p className="mt-3 text-xs text-frost/70">Loading…</p>}
                                {isLast && !hasMore && <p className="mt-3 text-xs text-frost/60">You've reached the end.</p>}
                            </div>
                        </section>
                        </SlideErrorBoundary>
                    );
                })}
            </div>
        </div>,
        document.body
    );
}
