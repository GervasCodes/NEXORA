import HomeCarousel from "./HomeCarousel";

// The 3D ring hero (hero3d/Hero3DScene.jsx, behind use3DHeroSupport) used to
// render here for visitors whose device/preferences supported it, while
// everyone else fell back to HomeCarousel - so the homepage banner looked
// different (and noticeably smaller) depending on who was logged in and
// what device they were on. Per request, every homepage - buyer, seller,
// logged-out, all of them - now always gets the same full-size HomeCarousel
// banner. The 3D scene files are left in place (hero3d/, Hero3DErrorBoundary,
// use3DHeroSupport) but are no longer wired up from here; they're dead code
// now and can be removed in a follow-up cleanup if wanted.
export default function Hero3D() {
    return <HomeCarousel />;
}
