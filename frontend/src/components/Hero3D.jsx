import { lazy, Suspense } from "react";
import HomeCarousel from "./HomeCarousel";
import Hero3DErrorBoundary from "./Hero3DErrorBoundary";
import { use3DHeroSupport } from "../hooks/use3DHeroSupport";

// Phase 7 sub-phase 1: dependency + fallback scaffolding for the 3D landing
// hero (see PHASE_7_NOTES.md for the full scoping). Renders in place of
// HomeCarousel in Home.jsx - not a second hero section - per the scoping
// note's recommendation, since HomeCarousel already owns the real
// slide/sponsorship data and href/badge behavior that any fallback needs to
// keep working unchanged.
//
// Hero3DScene (sub-phase 2's actual scene - a placeholder shape for now,
// see hero3d/Hero3DScene.jsx) is lazy-loaded, so the three/@react-three
// bundle is only ever fetched for a visitor whose device/preferences pass
// use3DHeroSupport. Everyone else - reduced-motion, no WebGL, a low-end
// device, or an explicit Save-Data request - gets HomeCarousel with zero
// extra bytes downloaded, not a hidden Canvas paid for and never shown.
const Hero3DScene = lazy(() => import("./hero3d/Hero3DScene"));

export default function Hero3D() {
    const supports3D = use3DHeroSupport();

    if (!supports3D) return <HomeCarousel />;

    return (
        <Hero3DErrorBoundary fallback={<HomeCarousel />}>
            <Suspense fallback={<HomeCarousel />}>
                <Hero3DScene />
            </Suspense>
        </Hero3DErrorBoundary>
    );
}
