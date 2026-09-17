import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useCurrency } from "../context/CurrencyContext";

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
    useEffect(() => {
        if (paused || count < 2) return undefined;
        const timer = setInterval(() => goTo(index + 1), AUTOPLAY_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [paused, count, index, goTo]);

    if (slides === null) {
        return (
            <div className="rounded-2xl overflow-hidden h-56 sm:h-72 lg:h-[420px] bg-frost/5 animate-pulse border border-frost/10" />
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
            className="relative rounded-2xl overflow-hidden h-56 sm:h-72 lg:h-[420px] border border-frost/10 bg-azure/10 group"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <Link to={slide.href} className="absolute inset-0 block">
                {slide.videoUrl ? (
                    <video
                        key={slide.videoUrl}
                        src={slide.videoUrl}
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
                        className="w-full h-full object-cover"
                        loading={index === 0 ? "eager" : "lazy"}
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-abyss/80 via-abyss/10 to-transparent" />

                <div className="absolute bottom-4 left-4 right-16">
                    <SlideBadge badge={slide.badge} />
                    <h3 className="font-display text-lg sm:text-xl text-frost leading-tight mt-1.5 truncate">
                        {slide.title}
                    </h3>
                    {slide.subtitle && (
                        <p className="text-frost/70 text-xs sm:text-sm truncate">{slide.subtitle}</p>
                    )}
                    <SlidePrice slide={slide} />
                </div>
            </Link>

            {count > 1 && (
                <>
                    <button
                        type="button"
                        onClick={() => goTo(index - 1)}
                        aria-label="Previous slide"
                        className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-abyss/40 hover:bg-abyss/60 text-frost items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                            <path d="M15 19 8 12l7-7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onClick={() => goTo(index + 1)}
                        aria-label="Next slide"
                        className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-abyss/40 hover:bg-abyss/60 text-frost items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                            <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                        {slides.map((s, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => goTo(i)}
                                aria-label={`Go to slide ${i + 1}`}
                                aria-current={i === index}
                                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-frost" : "w-1.5 bg-frost/40 hover:bg-frost/60"}`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
