import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useDataSaver } from "../context/DataSaverContext";
import { useLanguage } from "../context/LanguageContext";

// Respect the OS "reduce motion" setting: no autoplay, no crossfade.
const prefersReducedMotion = () =>
    typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

// How often autoplay advances - long enough to read a slide's title,
// short enough that a full deck (see HOME_CAROUSEL_MAX_SLIDES on the
// backend) cycles in well under a minute.
const AUTOPLAY_INTERVAL_MS = 6000;
// A drag/swipe shorter than this is treated as a tap, not a slide change.
const SWIPE_THRESHOLD_PX = 50;

// Safety-net default banner shown only when the API returns no live
// promo content (no active sponsorship/promotion/featured-store
// campaigns or seller promo videos yet) - same three real, verified,
// freely-licensed photos (Unsplash License - free for commercial use,
// no attribution required: https://unsplash.com/license) this hero
// briefly shipped with as a static collage: "Marketing Flatlay" by
// Campaign Creators (https://unsplash.com/photos/RSc6D7bO0fA), "Ships
// out today" by Bench Accounting (https://unsplash.com/photos/MGaFENpDCsw),
// and "GRAB courier makes delivery" by Kseniia Ilinykh
// (https://unsplash.com/photos/62JneRv7jW4).
const FALLBACK_SLIDES = [
    {
        type: "fallback",
        title: "Everything you need",
        subtitle: "Thousands of products from local vendors",
        imageUrl: "https://images.unsplash.com/photo-1533750516457-a7f992034fec?q=80&w=1200&auto=format&fit=crop",
        videoUrl: null,
        href: "/products",
        badge: null
    },
    {
        type: "fallback",
        title: "From sellers you trust",
        subtitle: "Verified stores, ready to ship",
        imageUrl: "https://images.unsplash.com/photo-1449247666642-264389f5f5b1?q=80&w=1200&auto=format&fit=crop",
        videoUrl: null,
        href: "/products",
        badge: null
    },
    {
        type: "fallback",
        title: "Tracked door to door",
        subtitle: "Follow every order from pickup to drop-off",
        imageUrl: "https://images.unsplash.com/photo-1587476351660-e9fa4bb8b26c?q=80&w=1200&auto=format&fit=crop",
        videoUrl: null,
        href: "/products",
        badge: null
    }
];

const BADGE_STYLES = {
    Sponsored: "bg-azure/90 text-frost",
    "On sale": "bg-coral/90 text-frost",
    "Featured store": "bg-mango/90 text-abyss"
};

function SlideBadge({ badge }) {
    if (!badge) return null;
    return (
        <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${BADGE_STYLES[badge] || "bg-frost/90 text-abyss"}`}>
            {badge}
        </span>
    );
}

function SlidePrice({ slide }) {
    const { format } = useCurrency();
    if (!slide.price) return null;
    const hasDiscount = slide.discountPrice && Number(slide.discountPrice) < Number(slide.price);
    return (
        <p className="text-frost text-sm mt-1">
            <span className="font-medium">{format(hasDiscount ? slide.discountPrice : slide.price)}</span>
            {hasDiscount && (
                <span className="text-frost/50 line-through ml-2">{format(slide.price)}</span>
            )}
        </p>
    );
}

export default function HomeCarousel() {
    const [slides, setSlides] = useState(null);
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const [reduceMotion] = useState(prefersReducedMotion);
    const { t } = useLanguage();
    const dataSaver = useDataSaver();
    const dragStartX = useRef(null);

    useEffect(() => {
        api.get("/categories/home-highlights")
            .then(({ data }) => setSlides(data.data?.length ? data.data : FALLBACK_SLIDES))
            .catch(() => setSlides(FALLBACK_SLIDES));
    }, []);

    const count = slides?.length || 0;

    const goTo = useCallback((next) => {
        setIndex((current) => {
            if (count === 0) return current;
            return (next + count) % count;
        });
    }, [count]);

    // Autoplay - paused on hover/focus (desktop) and mid-drag (touch),
    // so a slide never gets yanked out from under a reader or a swipe.
    // No manual pause/play control anymore (removed per request), so this
    // is the only thing that stops it other than reduced-motion.
    useEffect(() => {
        if (paused || reduceMotion || count < 2) return undefined;
        const timer = setInterval(() => goTo(index + 1), AUTOPLAY_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [paused, reduceMotion, count, index, goTo]);

    if (slides === null) {
        return (
            <div className="rounded-2xl overflow-hidden h-64 sm:h-96 lg:h-[540px] bg-frost/5 animate-pulse border border-frost/10" />
        );
    }

    const slide = slides[index];
    if (!slide) return null;

    const handleTouchStart = (e) => {
        dragStartX.current = e.touches[0].clientX;
        setPaused(true);
    };

    const handleTouchEnd = (e) => {
        if (dragStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - dragStartX.current;
        if (delta > SWIPE_THRESHOLD_PX) goTo(index - 1);
        else if (delta < -SWIPE_THRESHOLD_PX) goTo(index + 1);
        dragStartX.current = null;
        setPaused(false);
    };

    return (
        <div
            role="region"
            aria-roledescription="carousel"
            aria-label={t("home.carouselLabel")}
            aria-live={reduceMotion ? "polite" : "off"}
            className="relative rounded-2xl overflow-hidden h-64 sm:h-96 lg:h-[540px] border border-frost/10 bg-azure/10 group"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <Link to={slide.href} className="absolute inset-0 block">
                {slide.videoUrl && !dataSaver?.enabled ? (
                    <video
                        key={slide.videoUrl}
                        src={slide.videoUrl}
                        poster={slide.imageUrl || undefined}
                        className="w-full h-full object-cover"
                        autoPlay
                        muted
                        loop
                        playsInline
                    />
                ) : (
                    <img
                        key={slide.imageUrl}
                        src={slide.imageUrl}
                        alt={slide.title || ""}
                        className="w-full h-full object-cover animate-fade-in motion-reduce:animate-none"
                        loading={index === 0 ? "eager" : "lazy"}
                        fetchPriority={index === 0 ? "high" : undefined}
                        decoding="async"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-abyss/80 via-abyss/10 to-transparent" />

                <div className="absolute bottom-4 left-4 right-16">
                    <SlideBadge badge={slide.badge} />
                    <h3 className="font-display text-lg sm:text-xl text-frost leading-tight mt-1.5 line-clamp-2">
                        {slide.title}
                    </h3>
                    {slide.subtitle && (
                        <p className="text-frost/70 text-xs sm:text-sm truncate">{slide.subtitle}</p>
                    )}
                    <SlidePrice slide={slide} />
                </div>
            </Link>

            {/* Prev/next arrows and the manual play/pause toggle were removed
                per request - the banner just autoplays continuously now
                (still pausable by hover, and swipeable on touch), with only
                the slide-position dots left as a (non-navigating) indicator. */}
            {count > 1 && (
                <div className="absolute bottom-1 right-3 flex items-center gap-0.5">
                    {slides.map((_, i) => (
                        <span
                            key={i}
                            aria-hidden="true"
                            className={`block h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-frost" : "w-1.5 bg-frost/40"}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
