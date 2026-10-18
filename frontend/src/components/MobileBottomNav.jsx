import { Link, useLocation } from "react-router-dom";

// Mobile bottom navigation bar. Mounted through AppBottomNav.jsx (from
// Header.jsx), which picks the five tabs for guests, buyers and sellers.
//
// This SUPPLEMENTS the fuller navigation (Header's hamburger drawer,
// SellerLayout's grouped drawer) rather than replacing it - it is just
// the 5 most-reached-for destinations, always one tap away.
//
// Height is fixed at 3.5rem (+ safe area); index.css's --bottom-inset
// token mirrors that number, so change both together.
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
            className="md:hidden fixed bottom-0 inset-x-0 z-[var(--z-nav)] glass-strong border-t border-line/60"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
            <div className="flex items-stretch h-14">
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
                            className={`relative flex-1 min-w-0 h-full flex flex-col items-center justify-center gap-0.5 transition-colors duration-150 active:scale-95 ${
                                active ? "text-teal" : "text-ash"
                            }`}
                        >
                            <span className="relative">
                                <Icon className="w-5 h-5" />
                                {item.badge}
                            </span>
                            <span className={`text-xs leading-none truncate max-w-full px-1 ${active ? "font-medium" : ""}`}>{item.label}</span>
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
