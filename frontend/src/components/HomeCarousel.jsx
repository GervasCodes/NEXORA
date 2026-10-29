import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useDataSaver } from "../context/DataSaverContext";
import { useLanguage } from "../context/LanguageContext";

// How often autoplay advances - long enough to read a slide's title,
// short enough that a full deck (see HOME_CAROUSEL_MAX_SLIDES on the
// backend) cycles in well under a minute.
const AUTOPLAY_INTERVAL_MS = 6000;
// A drag/swipe shorter than this is treated as a tap, not a slide change.
const SWIPE_THRESHOLD_PX = 50;

// Safety-net default banner shown only when the API returns no live
// promo content (no active sponsorship/promotion/featured-store
// campaigns or seller promo videos yet). Phase 1: these used to be
// hot-linked Unsplash photos; they are now small original SVG artworks
// hosted with the app (no third-party request, a ~1 KB download each),
// and the copy is translated through the language dictionary.
const FALLBACK_SLIDES = [
    { type: "fallback", titleKey: "home.fallback.everything.title", subtitleKey: "home.fallback.everything.subtitle", imageUrl: "/images/hero/everything.svg", videoUrl: null, href: "/feed", badge: null },
    { type: "fallback", titleKey: "home.fallback.trusted.title", subtitleKey: "home.fallback.trusted.subtitle", imageUrl: "/images/hero/trusted.svg", videoUrl: null, href: "/feed", badge: null },
    { type: "fallback", titleKey: "home.fallback.tracked.title", subtitleKey: "home.fallback.tracked.subtitle", imageUrl: "/images/hero/tracked.svg", videoUrl: null, href: "/feed", badge: null }
];

const BADGE_STYLES = {
    Sponsored: "bg-azure/90 text-frost",
    "On sale": "bg-coral/90 text-frost",
    "Featured store": "bg-mango/90 text-abyss"
};

const BADGE_KEYS = {
    Sponsored: "home.badge.sponsored",
    "On sale": "home.badge.onSale",
    "Featured store": "home.badge.featuredStore"
};

function SlideBadge({ badge }) {
    const { t } = useLanguage();
    if (!badge) return null;
    return (
        <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${BADGE_STYLES[badge] || "bg-frost/90 text-abyss"}`}>
            {BADGE_KEYS[badge] ? t(BADGE_KEYS[badge]) : badge}
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
                <span className="text-frost/70 line-through ml-2">{format(slide.price)}</span>
            )}
        </p>
    );
}

export default function HomeCarousel() {
    const [slides, setSlides] = useState(null);
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
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

    // Fully automatic: advances on its own, no arrows and no play/pause
    // buttons. Only held briefly while a finger is mid-swipe so a slide is
    // never yanked out from under a touch. (Hover/focus no longer pause it.)
    useEffect(() => {
        if (paused || count < 2) return undefined;
        const timer = setInterval(() => goTo(index + 1), AUTOPLAY_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [paused, count, index, goTo]);

    if (slides === null) {
        return (
            <div className="rounded-2xl overflow-hidden h-64 sm:h-96 lg:h-[540px] bg-frost/5 animate-pulse border border-frost/10" />
        );
    }

    const slide = slides[index];
    if (!slide) return null;
    const slideTitle = slide.titleKey ? t(slide.titleKey) : slide.title;
    const slideSubtitle = slide.subtitleKey ? t(slide.subtitleKey) : slide.subtitle;

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
            aria-live="off"
            className="relative rounded-2xl overflow-hidden h-64 sm:h-96 lg:h-[540px] border border-frost/10 bg-azure/10 group"
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
                        alt={slideTitle || ""}
                        className="w-full h-full object-cover animate-fade-in motion-reduce:animate-none"
                        loading={index === 0 ? "eager" : "lazy"}
                        fetchPriority={index === 0 ? "high" : undefined}
                        decoding="async"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-abyss/80 via-abyss/10 to-transparent" />

                <div className="absolute bottom-4 left-4 right-16 max-h-[65%] overflow-hidden">
                    <SlideBadge badge={slide.badge} />
                    <h3 className="font-display text-lg sm:text-xl text-frost leading-tight mt-1.5 line-clamp-2">
                        {slideTitle}
                    </h3>
                    {slideSubtitle && (
                        <p className="text-frost/80 text-xs sm:text-sm truncate">{slideSubtitle}</p>
                    )}
                    <SlidePrice slide={slide} />
                </div>
            </Link>

            {count > 1 && (
                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-abyss/55 backdrop-blur px-2 py-1.5 pointer-events-none" aria-hidden="true">
                    {slides.map((_, i) => (
                        <span
                            key={i}
                            className={`block h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-frost" : "w-1.5 bg-frost/50"}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
