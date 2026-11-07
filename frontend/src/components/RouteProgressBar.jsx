import { useEffect, useRef, useState } from "react";
import { ROUTE_LOADING_EVENT } from "./RouteFallback";

/**
 * Animation System - loaders.
 *
 * A slim progress bar across the very top of the viewport while a route
 * is *actually* loading (a lazy page chunk being downloaded - see
 * <RouteFallback />, the Suspense fallback in App.jsx).
 *
 * It used to run a fixed timer on every navigation, which made instant,
 * already-cached navigations flash a bar that implied work that wasn't
 * happening. Now:
 *  - it only starts if the route is still loading after START_DELAY_MS,
 *    so cached navigations show nothing;
 *  - while loading it eases toward 90% (never claiming to be done early);
 *  - when the route settles it snaps to 100% and fades out.
 * Data fetches inside a page are covered by that page's skeletons.
 */
const START_DELAY_MS = 120;

export default function RouteProgressBar() {
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);
    const startTimer = useRef(null);
    const tick = useRef(null);
    const hideTimer = useRef(null);
    const showing = useRef(false);

    useEffect(() => {
        const clearAll = () => {
            clearTimeout(startTimer.current);
            clearInterval(tick.current);
            clearTimeout(hideTimer.current);
        };

        const begin = () => {
            clearTimeout(hideTimer.current);
            startTimer.current = setTimeout(() => {
                showing.current = true;
                setVisible(true);
                setProgress(12);
                tick.current = setInterval(() => {
                    setProgress((p) => p + (90 - p) * 0.12);
                }, 150);
            }, START_DELAY_MS);
        };

        const finish = () => {
            clearTimeout(startTimer.current);
            clearInterval(tick.current);
            if (!showing.current) return;
            showing.current = false;
            setProgress(100);
            hideTimer.current = setTimeout(() => {
                setVisible(false);
                setProgress(0);
            }, 280);
        };

        const onEvent = (e) => (e.detail?.loading ? begin() : finish());
        window.addEventListener(ROUTE_LOADING_EVENT, onEvent);
        return () => {
            window.removeEventListener(ROUTE_LOADING_EVENT, onEvent);
            clearAll();
        };
    }, []);

    return (
        <div
            aria-hidden="true"
            className="fixed top-0 left-0 right-0 z-[var(--z-float)] h-[3px] pointer-events-none"
        >
            <div
                className="h-full bg-gradient-to-r from-azure via-mango to-coral transition-[width,opacity] duration-300 ease-out"
                style={{
                    width: `${progress}%`,
                    opacity: visible ? 1 : 0
                }}
            />
        </div>
    );
}
