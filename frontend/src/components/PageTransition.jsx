import { useLocation } from "react-router-dom";

// The three sections whose Route has its own persistent layout wrapper
// with an <Outlet/> (SellerLayout, AdminLayout, DeliveryLayout) - each of
// those fetches its own data on mount (e.g. SellerLayout's seller-profile
// fetch) and is meant to stay mounted while the buyer/seller/admin moves
// between its child tabs. See the two-level use of this component below.
const LAYOUT_PREFIXES = ["/seller", "/delivery", "/admin"];

function sectionKeyFor(pathname) {
    const prefix = LAYOUT_PREFIXES.find((p) => pathname === p || pathname.startsWith(`${p}/`));
    return prefix || pathname;
}

/**
 * Phase 6: Animation System — page transitions.
 *
 * Gives route changes a soft fade + rise instead of the page just
 * snapping into place, without touching any individual page component.
 *
 * How it works: CSS `animation`s only (re)play when the element they're
 * on attaches to the DOM fresh - a plain class name doesn't retrigger on
 * its own. So this wrapper keys its outer <div> on the route so that,
 * when the key changes, the wrapper remounts and replays
 * `animate-page-in`.
 *
 * Two call sites, two different keys - this matters:
 * - Around the top-level `<Routes>` in App.jsx, keyed by `section` (e.g.
 *   "/seller" as a whole, not each individual seller sub-route). Keying
 *   that spot by the full pathname would remount SellerLayout /
 *   AdminLayout / DeliveryLayout every time their own child route
 *   changes, re-running their mount-time data fetches on every
 *   dashboard tab switch - a real regression, not just a missed
 *   animation.
 * - Inside each of those three layouts, wrapped directly around their
 *   own `<Outlet/>` and keyed by the full pathname there instead - that
 *   only remounts the leaf page React Router was already about to swap
 *   in for `<Outlet/>`, so tab switches inside a dashboard still get the
 *   same fade/rise, just without disturbing the layout shell around it.
 *
 * Deliberately not attempting an exit-crossfade of the previous page
 * (which would mean briefly rendering two live instances of the same
 * route tree) - several pages here fire data fetches / socket
 * subscriptions on mount (Messages, Checkout, delivery tracking, etc.),
 * so that would risk duplicate network calls or duplicate socket
 * listeners for a purely cosmetic effect. A clean enter animation gets
 * most of the "feels premium" result for none of that risk.
 *
 * Respects `prefers-reduced-motion` for free via the existing global rule
 * in index.css, which collapses all animation/transition durations.
 */
export default function PageTransition({ children, granular = false }) {
    const location = useLocation();
    const key = granular ? location.pathname : sectionKeyFor(location.pathname);

    return (
        <div key={key} className="animate-page-in">
            {children}
        </div>
    );
}

