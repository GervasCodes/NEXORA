import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { useDataSaver } from "../context/DataSaverContext";
import { pickFeedMedia } from "../utils/feedMedia";

// Start fetching the next page once the shopper is this many slides from
// the end of what's loaded, so the next screen is usually ready before
// they swipe to it.
export const LOAD_AHEAD = 3;

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

// Mobile full-screen, one-product-per-screen vertical snap feed. Purely a
// presentation layer: the product list, pagination state and loadMore all
// belong to ProductGrid, so the feed can't drift from the grid/list views
// for the same query (same array, same page cursor).
export default function ProductSwipeFeed({ products, hasMore, loadingMore, onLoadMore, onClose, onOpenFilters }) {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const dataSaver = useDataSaver();
    const scrollerRef = useRef(null);
    const closeRef = useRef(null);
    const requestedLenRef = useRef(-1);
    const requestedVideoIds = useRef(new Set());
    const [activeIndex, setActiveIndex] = useState(0);
    const [videoUrls, setVideoUrls] = useState({});
    const [muted, setMuted] = useState(true);

    const autoplay = !dataSaver?.enabled && !prefersReducedMotion();

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
            if (!product || product.videos !== undefined) return;
            if (requestedVideoIds.current.has(product.id)) return;

            requestedVideoIds.current.add(product.id);
            api.get(`/products/${product.slug}`)
                .then(({ data }) => {
                    const url = data?.data?.videos?.[0]?.video_url || null;
                    setVideoUrls((prev) => ({ ...prev, [product.id]: url }));
                })
                .catch(() => setVideoUrls((prev) => ({ ...prev, [product.id]: null })));
        });
    }, [activeIndex, products]);

    return (
        <div role="dialog" aria-modal="true" aria-label="Product feed" className="fixed inset-0 z-[1050] bg-black text-frost md:hidden">
            <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between gap-3 px-3 pb-6 pt-[calc(0.75rem+env(safe-area-inset-top))] bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
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

                <span className="text-xs text-frost/80" aria-live="polite">
                    {activeIndex + 1} / {products.length}{hasMore ? "+" : ""}
                </span>

                <button
                    type="button"
                    onClick={onOpenFilters}
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
                    const media = pickFeedMedia(product, videoUrls[product.id]);
                    const isActive = index === activeIndex;
                    const isLast = index === products.length - 1;
                    const hasDiscount = product.discount_price && Number(product.discount_price) < Number(product.price);
                    const imageSrc = media.type === "video" ? media.poster : media.src;

                    return (
                        <section
                            key={product.id}
                            data-feed-index={index}
                            aria-label={product.name}
                            className="snap-start snap-always h-full relative overflow-hidden bg-black"
                        >
                            {media.type === "video" && isActive ? (
                                <FeedVideo src={media.src} poster={media.poster} muted={muted} autoplay={autoplay} />
                            ) : imageSrc ? (
                                <img
                                    src={dataSaver?.optimize(imageSrc) || imageSrc}
                                    alt={product.name}
                                    loading={Math.abs(index - activeIndex) <= 1 ? "eager" : "lazy"}
                                    decoding="async"
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

                            <div className="absolute inset-x-0 bottom-0 z-10 px-4 pt-16 pb-[calc(1.5rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-black/85 via-black/40 to-transparent">
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
                    );
                })}
            </div>
        </div>
    );
}
