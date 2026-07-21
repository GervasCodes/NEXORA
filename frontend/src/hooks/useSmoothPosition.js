import { useEffect, useRef, useState } from "react";

const DEFAULT_ANIMATION_MS = 2500; // typical agent:location ping interval

// Takes the latest known { lat, lng, timestamp } and returns a position
// that glides toward it over time, re-rendering on every animation frame.
// This is what makes "Add smooth marker movement" true even when ticks
// arrive at an uneven cadence (a dropped ping, a burst of two close
// together, etc.) - a plain CSS transition alone assumes a fixed
// duration and looks wrong when the real gap between ticks varies.
export default function useSmoothPosition(target, animationMs = DEFAULT_ANIMATION_MS) {
    const [display, setDisplay] = useState(target || null);
    const fromRef = useRef(target || null);
    const toRef = useRef(target || null);
    const startRef = useRef(0);
    const frameRef = useRef(null);

    useEffect(() => {
        if (!target) return;

        const prevDisplay = displayRefSnapshot(fromRef, toRef, startRef, animationMs);
        fromRef.current = prevDisplay || target;
        toRef.current = target;
        startRef.current = performance.now();

        cancelAnimationFrame(frameRef.current);

        const step = (now) => {
            const elapsed = now - startRef.current;
            const t = Math.min(1, elapsed / animationMs);
            // Ease-out: fast at first, settles in - matches how a courier
            // dot "catching up" to a new ping should feel, not a linear
            // slide that looks robotic on longer jumps.
            const eased = 1 - Math.pow(1 - t, 3);

            const from = fromRef.current;
            const to = toRef.current;
            setDisplay({
                lat: from.lat + (to.lat - from.lat) * eased,
                lng: from.lng + (to.lng - from.lng) * eased
            });

            if (t < 1) {
                frameRef.current = requestAnimationFrame(step);
            }
        };

        frameRef.current = requestAnimationFrame(step);

        return () => cancelAnimationFrame(frameRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target?.lat, target?.lng, target?.timestamp]);

    return display;
}

// Reads whatever the hook had actually rendered up to "now" as the new
// animation's starting point, so a fresh tick arriving mid-glide doesn't
// jump back to the previous tick's raw position before continuing.
function displayRefSnapshot(fromRef, toRef, startRef, animationMs) {
    const from = fromRef.current;
    const to = toRef.current;
    if (!from || !to) return to;

    const elapsed = performance.now() - startRef.current;
    const t = Math.min(1, Math.max(0, elapsed / animationMs));
    const eased = 1 - Math.pow(1 - t, 3);

    return {
        lat: from.lat + (to.lat - from.lat) * eased,
        lng: from.lng + (to.lng - from.lng) * eased
    };
}
