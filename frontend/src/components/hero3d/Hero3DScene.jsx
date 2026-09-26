import { Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { Image as HeroImage, Html } from "@react-three/drei";
import api from "../../api/client";
import { useCurrency } from "../../context/CurrencyContext";
import { FALLBACK_SLIDES, BADGE_STYLES } from "./heroSlides";

// Phase 7 sub-phase 2 (see PHASE_7_NOTES.md): the real scene, replacing
// sub-phase 1's spinning-icosahedron placeholder. Same live data source and
// click-through behavior as HomeCarousel.jsx (/categories/home-highlights,
// same href/badge semantics) per the confirmed direction - product imagery
// on rotating/tilting cards, live data, drag/parallax interaction.

const RING_RADIUS = 3.2;
const DRAG_ROTATE_SPEED = 0.006; // radians per px of horizontal drag
const AUTOPLAY_RADIANS_PER_SEC = 0.12; // slow ambient spin while idle
const ROTATION_EASE_PER_SEC = 4; // higher = snappier easing toward target
const PARALLAX_MAX_TILT = 0.12; // radians of pointer-driven group tilt

function SlideBadge({ badge }) {
    if (!badge) return null;
    return (
        <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${BADGE_STYLES[badge] || "bg-frost/90 text-abyss"}`}>
            {badge}
        </span>
    );
}

function Card({ slide, angle, radius, isFront, onSelect }) {
    const { format } = useCurrency();
    const hasDiscount = slide.discountPrice && Number(slide.discountPrice) < Number(slide.price);
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;

    return (
        <group position={[x, 0, z]} rotation={[0, angle, 0]}>
            <HeroImage
                url={slide.imageUrl}
                scale={isFront ? [2.1, 1.32] : [1.85, 1.16]}
                radius={0.08}
                transparent
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect(slide);
                }}
                onPointerOver={() => { document.body.style.cursor = "pointer"; }}
                onPointerOut={() => { document.body.style.cursor = "auto"; }}
            />
            {isFront && (
                <Html center position={[0, -0.82, 0.05]} distanceFactor={6} style={{ pointerEvents: "none" }}>
                    <div className="bg-abyss/70 backdrop-blur-sm rounded-xl px-3 py-2 text-center w-[200px]">
                        <SlideBadge badge={slide.badge} />
                        <p className="font-display text-frost text-sm leading-tight mt-1 truncate">{slide.title}</p>
                        {slide.subtitle && (
                            <p className="text-frost/60 text-[11px] truncate">{slide.subtitle}</p>
                        )}
                        {slide.price && (
                            <p className="text-frost text-xs mt-0.5">
                                <span className="font-medium">{format(hasDiscount ? slide.discountPrice : slide.price)}</span>
                                {hasDiscount && (
                                    <span className="text-frost/50 line-through ml-1.5">{format(slide.price)}</span>
                                )}
                            </p>
                        )}
                    </div>
                </Html>
            )}
        </group>
    );
}

// Drag-to-rotate + pointer-parallax rig. Pointer tracking lives in a ref
// owned by the parent (updated from plain DOM pointer events on the
// wrapping div, not r3f's mesh-based pointer events, since dragging needs
// to keep working even when the pointer isn't over a card) and is only
// read inside useFrame - no per-pixel React re-renders while dragging.
function CarouselRig({ slides, pointerRef, activeIndex, setActiveIndex, onSelect }) {
    const groupRef = useRef(null);
    const rotationRef = useRef(0);
    const count = slides.length;
    const anglePerSlide = (Math.PI * 2) / count;

    useFrame((_, delta) => {
        const group = groupRef.current;
        const pointer = pointerRef.current;
        if (!group || !pointer) return;

        if (!pointer.dragging) {
            pointer.targetRotation += delta * AUTOPLAY_RADIANS_PER_SEC;
        }
        const ease = Math.min(1, delta * ROTATION_EASE_PER_SEC);
        rotationRef.current += (pointer.targetRotation - rotationRef.current) * (pointer.dragging ? 1 : ease);
        group.rotation.y = rotationRef.current;

        const targetTiltX = -pointer.normY * PARALLAX_MAX_TILT;
        group.rotation.x += (targetTiltX - group.rotation.x) * ease;

        const normalized = ((rotationRef.current % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const nearest = Math.round(normalized / anglePerSlide) % count;
        if (nearest !== activeIndex) setActiveIndex(nearest);
    });

    return (
        <group ref={groupRef}>
            {slides.map((slide, i) => (
                <Card
                    key={`${slide.imageUrl}-${i}`}
                    slide={slide}
                    angle={i * anglePerSlide}
                    radius={RING_RADIUS}
                    isFront={i === activeIndex}
                    onSelect={onSelect}
                />
            ))}
        </group>
    );
}

export default function Hero3DScene() {
    const [slides, setSlides] = useState(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const navigate = useNavigate();
    const pointerRef = useRef({ dragging: false, lastX: 0, targetRotation: 0, normY: 0 });
    const wrapperRef = useRef(null);

    // Sub-phase 3 (perf pass, see PHASE_7_NOTES.md): stop the render loop
    // entirely - not just pause the visual animation - when nobody could
    // possibly be looking at it. A backgrounded tab or a hero scrolled out
    // of view is the classic way a WebGL scene quietly burns battery/CPU
    // for no benefit; browsers already throttle rAF in background tabs,
    // but frameloop="never" gives an explicit guarantee here rather than
    // relying on that. Defaults to visible/active so nothing regresses on
    // a browser without IntersectionObserver support.
    const [inView, setInView] = useState(true);
    const [pageVisible, setPageVisible] = useState(
        typeof document === "undefined" ? true : !document.hidden
    );

    useEffect(() => {
        if (typeof IntersectionObserver === "undefined" || !wrapperRef.current) return undefined;
        const observer = new IntersectionObserver(
            ([entry]) => setInView(entry.isIntersecting),
            { threshold: 0.1 }
        );
        observer.observe(wrapperRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const handleVisibility = () => setPageVisible(!document.hidden);
        document.addEventListener("visibilitychange", handleVisibility);
        return () => document.removeEventListener("visibilitychange", handleVisibility);
    }, []);

    const renderLoopActive = inView && pageVisible;

    useEffect(() => {
        api.get("/categories/home-highlights")
            .then(({ data }) => {
                // Same live endpoint as HomeCarousel.jsx. Video slides are left
                // to the 2D carousel for now - texturing a <video> onto a 3D
                // plane is real additional work (a VideoTexture + play-state
                // handling) that isn't part of this sub-phase's scope per
                // PHASE_7_NOTES.md; any video-only slide is filtered out here
                // rather than rendered broken.
                const withImages = (data.data || []).filter((s) => s.imageUrl);
                setSlides(withImages.length ? withImages : FALLBACK_SLIDES);
            })
            .catch(() => setSlides(FALLBACK_SLIDES));
    }, []);

    const handlePointerDown = (e) => {
        pointerRef.current.dragging = true;
        pointerRef.current.lastX = e.clientX;
    };

    const handlePointerMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        pointerRef.current.normY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
        if (!pointerRef.current.dragging) return;
        const deltaX = e.clientX - pointerRef.current.lastX;
        pointerRef.current.lastX = e.clientX;
        pointerRef.current.targetRotation -= deltaX * DRAG_ROTATE_SPEED;
    };

    const handlePointerUp = () => {
        pointerRef.current.dragging = false;
    };

    if (slides === null) {
        return (
            <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] rounded-2xl overflow-hidden bg-frost/5 animate-pulse border border-frost/10" />
        );
    }

    return (
        <div
            ref={wrapperRef}
            className="relative w-full aspect-[16/9] sm:aspect-[21/9] rounded-2xl overflow-hidden bg-abyss touch-none select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 1.5]} frameloop={renderLoopActive ? "always" : "never"}>
                <ambientLight intensity={0.7} />
                <directionalLight position={[3, 4, 5]} intensity={1.1} />
                {/* Local Suspense so an image texture loading mid-session shows
                    an empty canvas rather than bouncing the whole hero back to
                    HomeCarousel (Hero3D.jsx's outer Suspense boundary only
                    exists to cover the initial lazy-chunk load). */}
                <Suspense fallback={null}>
                    <CarouselRig
                        slides={slides}
                        pointerRef={pointerRef}
                        activeIndex={activeIndex}
                        setActiveIndex={setActiveIndex}
                        onSelect={(slide) => navigate(slide.href)}
                    />
                </Suspense>
            </Canvas>
        </div>
    );
}
