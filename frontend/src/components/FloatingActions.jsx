import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

// One bottom-end region for floating launchers (AI assistant, support).
// Children stack top-to-bottom, so the order passed in is the visual order.
// Clears the iPhone home-indicator safe area and uses the shared
// --z-float token.
//
// Phase 1: the launchers no longer appear at load. A new visitor's first
// seconds belong to the page itself, so they fade in after FLOAT_DELAY_MS -
// or immediately on checkout, where help is most likely to be needed.
export const FLOAT_DELAY_MS = 20000;
const IMMEDIATE_ROUTE = /^\/checkout(\/|$)/;

export default function FloatingActions({ children }) {
    const { pathname } = useLocation();
    const [timerElapsed, setTimerElapsed] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setTimerElapsed(true), FLOAT_DELAY_MS);
        return () => clearTimeout(timer);
    }, []);

    if (!timerElapsed && !IMMEDIATE_ROUTE.test(pathname)) return null;

    return (
        <div className="fixed right-4 bottom-[calc(1rem+var(--bottom-inset))] z-[var(--z-float)] flex flex-col items-end gap-3 pointer-events-none animate-fade-in motion-reduce:animate-none">
            <div className="pointer-events-auto flex flex-col items-end gap-3">
                {children}
            </div>
        </div>
    );
}
