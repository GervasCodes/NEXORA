import { Link, useLocation } from "react-router-dom";

// Unified mobile bottom navigation (Monetization Control roadmap,
//  Mobile Navigation Unification). One shared component so
// Buyer (mounted from Header.jsx), Seller (mounted from
// SellerLayout.jsx), and Delivery Agent (mounted from
// DeliveryLayout.jsx) all get the same look, the same touch-target
// sizing, and the same active/back-button behavior instead of each
// role inventing its own bottom bar independently.
//
// This SUPPLEMENTS each role's existing fuller navigation (Header's
// hamburger drawer, SellerLayout's grouped drawer, DeliveryLayout's tab
// row) rather than replacing it - it's just the 5 most-reached-for
// destinations, always one tap away, on top of everything else still
// being reachable exactly as it was before this phase.
//
// Props:
//   items - exactly the tabs to render, e.g.:
//     [{ to, label, icon: IconComponent, badge, end }]
//     `end` (boolean, optional) - passed through to the same
//     start-vs-prefix active-match rule NavLink's `end` prop uses, for
//     a root tab like "/seller" that would otherwise match every
//     nested seller route as "active" too.
//
// Deliberately hidden at `md` and above - it's a phone-sized affordance;
// desktop/tablet already has full-width top nav with room for
// everything, so a persistent bottom bar there would just be
// redundant chrome.
export default function MobileBottomNav({ items }) {
    const location = useLocation();

    const isActive = (item) =>
        item.end ? location.pathname === item.to : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

    return (
        <nav
            aria-label="Primary"
            className="md:hidden fixed bottom-0 inset-x-0 z-40 glass-strong border-t border-line/60"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
            <div className="flex items-stretch">
                {items.map((item) => {
                    const active = isActive(item);
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.to}
                            to={item.to}
                            aria-label={item.label}
                            aria-current={active ? "page" : undefined}
                            // min-h-[48px] + flex-1 gives every tab a full-width,
                            // full-height tap target (well over the 44px
                            // minimum) instead of just the icon+label's own
                            // tight bounding box - the roadmap's "small mobile
                            // buttons" complaint, addressed at the touch-target
                            // level, not just visually.
                            className={`relative flex-1 min-h-[52px] flex flex-col items-center justify-center gap-0.5 transition-colors duration-150 active:scale-95 ${
                                active ? "text-teal" : "text-ash"
                            }`}
                        >
                            <span className="relative">
                                <Icon className="w-5 h-5" />
                                {item.badge}
                            </span>
                            <span className={`text-[10px] leading-none ${active ? "font-medium" : ""}`}>{item.label}</span>
                            <span
                                aria-hidden="true"
                                className={`absolute top-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full bg-teal transition-all duration-150 ${
                                    active ? "w-8 opacity-100" : "w-0 opacity-0"
                                }`}
                            />
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
