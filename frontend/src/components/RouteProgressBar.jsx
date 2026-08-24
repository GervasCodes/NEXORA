import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Animation System — loaders.
 *
 * A slim progress bar across the very top of the viewport that sweeps in
 * on every route change, the same idea as the bar YouTube/GitHub show
 * while a new page is loading. This is a *perceived-performance* cue,
 * separate from the existing <PageLoader /> spinner (which only shows
 * while a lazy-loaded route chunk is actually still downloading, inside
 * the <Suspense> fallback) — this bar animates on every navigation,
 * including instant ones, so the app always acknowledges the tap/click
 * immediately instead of feeling unresponsive for the first frame.
 *
 * Deliberately simulated rather than tied to real network progress
 * (there's no single "page load" promise to watch here — a route can
 * finish instantly from cache, trigger a lazy import, and/or kick off
 * its own data fetches independently) — same approach NProgress and
 * similar libraries use, and why this doesn't add one as a dependency.
 */
export default function RouteProgressBar() {
    const location = useLocation();
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);
    const timers = useRef([]);

    useEffect(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];

        setVisible(true);
        setProgress(12);

        // Quick ramp that decelerates - never quite reaches 100% on its
        // own, since we don't actually know when the route is "done".
        timers.current.push(setTimeout(() => setProgress(45), 60));
        timers.current.push(setTimeout(() => setProgress(68), 180));
        timers.current.push(setTimeout(() => setProgress(82), 380));

        // Finish it off and fade out shortly after - long enough to
        // cover a lazy chunk fetch on a typical connection, short enough
        // to never feel like it's lying about still loading.
        const finish = setTimeout(() => setProgress(100), 520);
        const hide = setTimeout(() => setVisible(false), 760);
        timers.current.push(finish, hide);

        return () => timers.current.forEach(clearTimeout);
    }, [location.pathname]);

    return (
        <div
            aria-hidden="true"
            className="fixed top-0 left-0 right-0 z-[60] h-[3px] pointer-events-none"
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
