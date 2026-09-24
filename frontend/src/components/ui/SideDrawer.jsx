import { useEffect, useState } from "react";

// Shared edge-anchored overlay drawer (UI Modernization Phase 2 - Shared
// side-drawer primitive). Replaces four independently-built "toggle
// button + collapsible nav panel" implementations (Header's top-anchored
// slide-down panel, AdminLayout's/SellerLayout's inline mobile panel +
// always-visible desktop sidebar) with one component so a fifth
// divergent version never gets built.
//
// Deliberately mount/unmount-driven rather than permanently mounted with
// visibility toggled: the panel (and its scrollable region) only exists
// in the DOM while `open` is true or while the brief close transition is
// still playing. AdminLayout's original mobile drawer already got this
// right (`{drawerOpen && (...)}`) - this preserves that behavior instead
// of regressing to an always-mounted-but-hidden container.
//
// z-[1100]: above MobileBottomNav (z-40) and everything else in normal
// flow, but below ConfirmDialog (z-[1200]) so a confirmation (e.g. sign
// out) triggered from inside an open drawer still renders on top of it.
const TRANSITION_MS = 250;

export default function SideDrawer({
    open,
    onClose,
    side = "right",
    id,
    ariaLabel,
    widthClassName = "w-80 max-w-[85vw]",
    children
}) {
    const [mounted, setMounted] = useState(open);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        if (open) {
            setMounted(true);
            // Mount first at the translated-out position, then flip to
            // the open transform on the next frame so the browser has a
            // starting frame to transition from - without this the panel
            // would just appear already open, no slide.
            const raf = requestAnimationFrame(() => setShown(true));
            return () => cancelAnimationFrame(raf);
        }
        setShown(false);
        const timeout = setTimeout(() => setMounted(false), TRANSITION_MS);
        return () => clearTimeout(timeout);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose]);

    if (!mounted) return null;

    const edgeClass = side === "left" ? "left-0" : "right-0";
    const closedTransform = side === "left" ? "-translate-x-full" : "translate-x-full";

    return (
        <div className="fixed inset-0 z-[1100]">
            <div
                className={`absolute inset-0 bg-abyss/50 transition-opacity ease-out ${shown ? "opacity-100" : "opacity-0"}`}
                style={{ transitionDuration: `${TRANSITION_MS}ms` }}
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                id={id}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                className={`absolute top-0 ${edgeClass} h-full ${widthClassName} glass-strong shadow-xl flex flex-col transition-transform ease-out ${
                    shown ? "translate-x-0" : closedTransform
                }`}
                style={{ transitionDuration: `${TRANSITION_MS}ms` }}
            >
                {/* This scrollable region - and everything inside it - only
                    exists while the drawer is mounted (open or mid-close),
                    never permanently. See file header. */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
            </div>
        </div>
    );
}
