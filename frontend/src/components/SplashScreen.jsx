import { useEffect, useState } from "react";

const SESSION_KEY = "nexora_splash_shown";

// Minimum time the branded splash stays visible even once the app is
// ready, so it always reads as a deliberate brand moment rather than a
// flash that may disappear before it's even been seen. (Phase 3: bumped
// from 700ms into the 1200-1600ms range - long enough for the fill
// indicator below to read as intentional, short enough not to feel like
// a delay. FAILSAFE_MS is untouched.)
const MIN_DISPLAY_MS = 1400;
// Safety net: never block the app for more than this even if `appReady`
// never resolves for some reason.
const FAILSAFE_MS = 4000;

export default function SplashScreen({ appReady, onDone }) {
    const [leaving, setLeaving] = useState(false);
    // the "tap to skip" hint now fades in after a short delay instead of
    // being on screen from frame one, so the very first moment reads as
    // pure brand rather than a UI hint competing with it.
    const [showSkipHint, setShowSkipHint] = useState(false);
    const [minTimeElapsed, setMinTimeElapsed] = useState(false);

    const finish = () => {
        if (leaving) return;
        setLeaving(true);
        sessionStorage.setItem(SESSION_KEY, "1");
        // Let the fade-out transition play before unmounting
        setTimeout(onDone, 400);
    };

    useEffect(() => {
        const minTimer = setTimeout(() => setMinTimeElapsed(true), MIN_DISPLAY_MS);
        const skipHintTimer = setTimeout(() => setShowSkipHint(true), 900);
        const failsafe = setTimeout(finish, FAILSAFE_MS);
        return () => {
            clearTimeout(minTimer);
            clearTimeout(skipHintTimer);
            clearTimeout(failsafe);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Dismiss as soon as the app's real readiness signal (session check)
    // has resolved AND the minimum brand-display time has elapsed -
    // whichever finishes last. `appReady` may already be true on first
    // render for a fresh guest visit, so the minimum timer is what keeps
    // this from being an instant flash in that case.
    useEffect(() => {
        if (appReady && minTimeElapsed) finish();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appReady, minTimeElapsed]);

    const handleKeyDown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            finish();
        }
    };

    return (
        <div
            onClick={finish}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label="Skip intro"
            className={`fixed inset-0 z-[100] bg-abyss overflow-hidden flex flex-col items-center justify-center cursor-pointer transition-opacity duration-400 ease-out focus:outline-none ${
                leaving ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
            // `100dvh`/`100dvw` track the *actual* visible viewport on
            // mobile browsers, whose address/toolbar chrome can shrink or
            // grow after load - without this the splash can leave a
            // sliver of page showing beneath it on phones. Safe-area
            // insets keep it edge-to-edge behind notches/home-indicators
            // and TV overscan, so the background truly fills the display
            // on any device, the same way a native app's launch screen
            // (TikTok/Instagram-style) does instead of a smaller centered
            // card.
            style={{
                height: "100dvh",
                width: "100dvw",
                paddingTop: "env(safe-area-inset-top)",
                paddingBottom: "env(safe-area-inset-bottom)",
                paddingLeft: "env(safe-area-inset-left)",
                paddingRight: "env(safe-area-inset-right)",
            }}
        >
            {/* Full-screen ambient glow — pure CSS, so it's crisp at any
                resolution/screen size with no exported image asset. Colors
                are sampled from the logo's own violet-to-azure gradient.
                Sized in vmax so the glow always reaches the far corners
                whether it's a tall phone, a wide TV, or a square-ish
                desktop window. */}
            <div
                className="pointer-events-none absolute -top-1/4 -left-1/4 w-[90vmax] h-[90vmax] rounded-full opacity-40 blur-[120px] animate-pulse"
                style={{ background: "radial-gradient(circle, #7C3AED 0%, transparent 70%)" }}
            />
            <div
                className="pointer-events-none absolute -bottom-1/4 -right-1/4 w-[90vmax] h-[90vmax] rounded-full opacity-40 blur-[120px] animate-pulse"
                style={{ background: "radial-gradient(circle, #1D4ED8 0%, transparent 70%)", animationDelay: "1s" }}
            />

            {/* branded wordmark - reuses the exact same "NEXORA" mark
                treatment as Header.jsx/Footer.jsx (font-display italic)
                so it's recognizably the same brand. Phase 3: added the
                core-actions line under the wordmark, and swapped the
                spinning two-ring loader for a bar that fills from empty
                to full over MIN_DISPLAY_MS - a "deliberate brand moment"
                reads better as progress toward something than as an
                indefinite spin. Pure CSS (see the <style> block below),
                no new dependency. */}
            <div className="relative z-10 flex flex-col items-center justify-center gap-6">
                <div className="flex flex-col items-center gap-3">
                    <span className="font-display italic text-4xl sm:text-5xl text-frost tracking-tight animate-scale-in drop-shadow-[0_2px_16px_rgba(124,58,237,0.5)]">
                        NEXORA
                    </span>
                    <span className="h-px w-10 bg-frost/30 animate-scale-in [animation-delay:120ms]" />
                    <span className="text-frost/50 text-[11px] sm:text-xs font-medium tracking-[0.25em] uppercase animate-scale-in [animation-delay:220ms]">
                        Buy · Sell · Book · Deliver
                    </span>
                </div>

                <div className="w-28 sm:w-32 h-[3px] rounded-full bg-frost/15 overflow-hidden" role="status" aria-hidden="true">
                    <div
                        className="h-full rounded-full origin-left"
                        style={{
                            background: "linear-gradient(90deg, #7C3AED 0%, #1D4ED8 100%)",
                            animation: `nexora-splash-fill ${MIN_DISPLAY_MS}ms linear forwards`,
                        }}
                    />
                </div>
                <span className="sr-only">Loading</span>
            </div>

            <style>{`
                @keyframes nexora-splash-fill {
                    from { width: 0%; }
                    to { width: 100%; }
                }
            `}</style>

            <p
                className={`absolute z-20 left-1/2 -translate-x-1/2 bottom-8 text-frost/70 text-xs mt-8 tracking-wide drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)] transition-opacity duration-500 ${
                    showSkipHint ? "opacity-100" : "opacity-0"
                }`}
            >
                Tap to skip
            </p>
        </div>
    );
}
