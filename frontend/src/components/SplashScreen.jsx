import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "nexora_splash_shown";

export default function SplashScreen({ onDone }) {
    const videoRef = useRef(null);
    const [leaving, setLeaving] = useState(false);
    // Phase 7: whether the video has actually buffered enough to play -
    // used to crossfade it in over the branded wordmark frame below,
    // instead of the video just popping in whenever the browser gets
    // around to decoding its first frame (which, on a slow connection,
    // used to leave nothing but the ambient glow on screen with no
    // brand mark for a beat).
    const [videoReady, setVideoReady] = useState(false);
    // Phase 7: if the clip 404s or otherwise fails, the old behavior was
    // to call `finish()` immediately from `onError` - on a broken video
    // that meant the splash could disappear having shown no branding at
    // all. Now it falls back to the CSS wordmark frame for a short,
    // deliberate beat instead of an invisible flash.
    const [videoFailed, setVideoFailed] = useState(false);
    // Phase 7: the "tap to skip" hint now fades in after a short delay
    // instead of being on screen from frame one, so the very first
    // moment reads as pure brand rather than a UI hint competing with it.
    const [showSkipHint, setShowSkipHint] = useState(false);

    const finish = () => {
        if (leaving) return;
        setLeaving(true);
        sessionStorage.setItem(SESSION_KEY, "1");
        // Let the fade-out transition play before unmounting
        setTimeout(onDone, 400);
    };

    useEffect(() => {
        // Safety net: never block the app for more than ~6s even if the
        // video fails to fire onEnded for some reason (slow connection, etc).
        const failsafe = setTimeout(finish, 6000);
        const skipHintTimer = setTimeout(() => setShowSkipHint(true), 900);
        return () => {
            clearTimeout(failsafe);
            clearTimeout(skipHintTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleVideoError = () => {
        setVideoFailed(true);
        // Give the branded wordmark frame a beat to actually be seen
        // rather than finishing instantly with nothing shown.
        setTimeout(finish, 1400);
    };

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
                desktop window. Sits behind the video, so it only shows
                through any transparent frames/letterboxing the clip has. */}
            <div
                className="pointer-events-none absolute -top-1/4 -left-1/4 w-[90vmax] h-[90vmax] rounded-full opacity-40 blur-[120px] animate-pulse"
                style={{ background: "radial-gradient(circle, #7C3AED 0%, transparent 70%)" }}
            />
            <div
                className="pointer-events-none absolute -bottom-1/4 -right-1/4 w-[90vmax] h-[90vmax] rounded-full opacity-40 blur-[120px] animate-pulse"
                style={{ background: "radial-gradient(circle, #1D4ED8 0%, transparent 70%)", animationDelay: "1s" }}
            />

            {/* Phase 7: branded wordmark frame - on screen from the very
                first paint (no dependency on the video having loaded
                anything yet), and reuses the exact same "NEXORA" mark
                treatment as Header.jsx/Footer.jsx (font-display italic)
                so it's recognizably the same brand, not a placeholder.
                Fades out once the video is actually ready to show, or
                stays up as the whole splash if the video fails. */}
            <div
                className={`absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 transition-opacity duration-500 ${
                    videoReady && !videoFailed ? "opacity-0" : "opacity-100"
                }`}
            >
                <span className="font-display italic text-4xl sm:text-5xl text-frost tracking-tight animate-scale-in drop-shadow-[0_2px_16px_rgba(124,58,237,0.5)]">
                    NEXORA
                </span>
                <span className="h-px w-10 bg-frost/30 animate-scale-in [animation-delay:120ms]" />
            </div>

            {/* Full-bleed container - the same launch feel as opening
                Instagram or TikTok, not a centered card. `absolute inset-0
                w-full h-full` fills the exact box the parent already sized
                to `100dvh`/`100dvw` (safe-area aware). `object-contain`
                (not `object-cover`) means the whole clip is always shown -
                nothing is cropped off the edges - so any wordmark/text
                baked into the video stays fully readable on every aspect
                ratio (tall phones, wide desktops, tablets) instead of
                being clipped when the video's ratio doesn't match the
                viewport. The ambient glow behind it fills whatever
                letterbox space is left, so there's still no bare/dead
                background showing around the video.

                Phase 7: opacity is now tied to `videoReady` (set from
                `onCanPlay`) rather than always being on top - it crossfades
                in over the wordmark frame above instead of just appearing
                whenever the browser happens to paint its first decoded
                frame. Hidden entirely once `videoFailed`, since a broken
                <video> can otherwise still occupy space/paint a broken-
                media icon in some browsers. */}
            {!videoFailed && (
                <video
                    ref={videoRef}
                    src="/brand/nexora-intro.mp4"
                    autoPlay
                    muted
                    playsInline
                    preload="auto"
                    onCanPlay={() => setVideoReady(true)}
                    onPlaying={() => setVideoReady(true)}
                    onEnded={finish}
                    onError={handleVideoError}
                    className={`absolute inset-0 z-10 w-full h-full object-contain transition-opacity duration-500 ${
                        videoReady ? "opacity-100" : "opacity-0"
                    }`}
                />
            )}

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
