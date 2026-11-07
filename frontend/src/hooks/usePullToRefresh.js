import { useCallback, useEffect, useRef, useState } from "react";

const RESISTANCE = 0.5;
const MAX_PULL = 120;

const matches = (query) => {
    try { return typeof window !== "undefined" && window.matchMedia(query).matches; } catch { return false; }
};
export const isTouchDevice = () => matches("(pointer: coarse)");
export const prefersReducedMotion = () => matches("(prefers-reduced-motion: reduce)");

// A touch that starts in one of these must keep its normal behaviour:
// forms, maps, the swipe feed, dialogs, or anything opted out with
// data-no-ptr.
const BLOCKED = "input, textarea, select, [contenteditable=true], .leaflet-container, [role=dialog], [aria-modal=true], [data-no-ptr]";

// True when the touch began inside an element that can still scroll up
// (so the gesture belongs to that scroller, not to us) or sideways.
function insideOtherScroller(target, boundary) {
    let el = target;
    while (el && el !== boundary && el !== document.body) {
        const style = window.getComputedStyle(el);
        const y = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
        if (y && el.scrollTop > 0) return true;
        const x = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth;
        if (x) return true;
        el = el.parentElement;
    }
    return false;
}

/**
 * usePullToRefresh - touch-only pull-down-to-refresh for a page.
 *
 *   const { containerRef, pull, status } = usePullToRefresh({ onRefresh });
 *
 * Arms only when the page is scrolled to the very top, the touch starts
 * outside blocked/other scrollers, and the first movement is vertical.
 * Applies resistance, fires `onRefresh()` past `threshold`, and awaits the
 * returned promise. `status`: idle | pulling | ready | refreshing | done.
 * Disabled on non-touch devices and when `enabled` is false.
 */
export default function usePullToRefresh({ onRefresh, enabled = true, threshold = 70 }) {
    const containerRef = useRef(null);
    const [pull, setPull] = useState(0);
    const [status, setStatus] = useState("idle");
    const refreshRef = useRef(onRefresh);
    refreshRef.current = onRefresh;
    const statusRef = useRef("idle");
    const setStatusBoth = useCallback((s) => { statusRef.current = s; setStatus(s); }, []);

    const active = enabled && isTouchDevice() && !prefersReducedMotion();

    useEffect(() => {
        const node = containerRef.current;
        if (!node || !active) return undefined;

        // Stop the browser's own pull-to-refresh / rubber-band from
        // fighting ours while this page is mounted.
        const root = document.documentElement;
        const prevOverscroll = root.style.overscrollBehaviorY;
        root.style.overscrollBehaviorY = "contain";

        let startY = 0;
        let startX = 0;
        let tracking = false;
        let decided = false;

        const onStart = (e) => {
            if (statusRef.current === "refreshing" || e.touches.length !== 1) return;
            if (window.scrollY > 0 || e.target.closest?.(BLOCKED) || insideOtherScroller(e.target, node)) return;
            startY = e.touches[0].clientY;
            startX = e.touches[0].clientX;
            tracking = true;
            decided = false;
        };

        const onMove = (e) => {
            if (!tracking) return;
            const dy = e.touches[0].clientY - startY;
            const dx = e.touches[0].clientX - startX;
            if (!decided) {
                if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
                decided = true;
                if (Math.abs(dx) > Math.abs(dy) || dy < 0) { tracking = false; return; }
            }
            if (window.scrollY > 0) { tracking = false; setPull(0); setStatusBoth("idle"); return; }
            if (e.cancelable) e.preventDefault();
            const distance = Math.min(MAX_PULL, dy * RESISTANCE);
            setPull(distance);
            setStatusBoth(distance >= threshold ? "ready" : "pulling");
        };

        const onEnd = async () => {
            if (!tracking) return;
            tracking = false;
            if (statusRef.current !== "ready") { setPull(0); setStatusBoth("idle"); return; }
            setStatusBoth("refreshing");
            setPull(threshold * 0.7);
            try { await refreshRef.current?.(); } catch { /* the page shows its own error */ }
            setStatusBoth("done");
            setTimeout(() => { setPull(0); setStatusBoth("idle"); }, 600);
        };

        node.addEventListener("touchstart", onStart, { passive: true });
        node.addEventListener("touchmove", onMove, { passive: false });
        node.addEventListener("touchend", onEnd);
        node.addEventListener("touchcancel", onEnd);
        return () => {
            node.removeEventListener("touchstart", onStart);
            node.removeEventListener("touchmove", onMove);
            node.removeEventListener("touchend", onEnd);
            node.removeEventListener("touchcancel", onEnd);
            root.style.overscrollBehaviorY = prevOverscroll;
        };
    }, [active, threshold, setStatusBoth]);

    return { containerRef, pull, status, active };
}
