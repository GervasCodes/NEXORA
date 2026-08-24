import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

// Groups the header's lower-frequency destinations (Wallet, Loyalty,
// Affiliate, Group buys, Live selling, Guides, Bookings, Disputes,
// Saved) behind a single "Tools" button instead of every one of them
// getting its own permanent slot in the desktop icon row. That row was
// growing every time a feature shipped; this keeps it at a fixed size
// while every link stays exactly as reachable as before, one extra
// click deep. Cart/Messages/Orders/Account/role-home stay inline in
// Header.jsx since they're the highest-frequency actions.
export default function ToolsMenu({ links, isActive, badgeFor }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const location = useLocation();

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Close automatically on navigation, same as the mobile drawer does.
    useEffect(() => {
        setOpen(false);
    }, [location.pathname]);

    if (links.length === 0) return null;

    const anyActive = links.some((l) => isActive(l.to));

    return (
        <div className="relative" ref={rootRef}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label="More tools"
                aria-expanded={open}
                className={`group relative flex items-center gap-1.5 h-10 px-3 rounded-lg transition-all duration-150 ease-out
                    ${open || anyActive ? "bg-frost/15 text-azure-light" : "text-frost/75 hover:text-azure-light hover:bg-frost/10"}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 transition-transform duration-150 ease-out group-hover:scale-110">
                    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
                    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
                </svg>
                <span className="text-sm font-medium hidden lg:inline">Tools</span>
            </button>

            {open && (
                <div className="absolute right-0 mt-3 w-72 max-w-[90vw] glass-strong text-ink rounded-lg shadow-xl border border-line/60 overflow-hidden animate-scale-in origin-top-right z-50">
                    <div className="px-4 py-3 border-b border-line/60">
                        <p className="text-sm font-semibold">More tools</p>
                    </div>
                    <div className="grid grid-cols-2 gap-1 p-2">
                        {links.map((link) => {
                            const Icon = link.icon;
                            const active = isActive(link.to);
                            const badge = badgeFor?.(link.to);
                            return (
                                <Link
                                    key={link.to}
                                    to={link.to}
                                    onClick={() => setOpen(false)}
                                    className={`relative flex items-center gap-2.5 px-2.5 py-2.5 rounded-md text-sm transition-colors duration-150
                                        ${active ? "bg-teal/10 text-teal font-medium" : "hover:bg-line/20"}`}
                                >
                                    <Icon className="w-[18px] h-[18px] shrink-0" />
                                    <span className="truncate">{link.label}</span>
                                    {badge}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
