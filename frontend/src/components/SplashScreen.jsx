import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "nexora_splash_shown";

export default function SplashScreen({ onDone }) {
    const videoRef = useRef(null);
    const [leaving, setLeaving] = useState(false);

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
        return () => clearTimeout(failsafe);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            onClick={finish}
            className={`fixed inset-0 z-[100] bg-abyss overflow-hidden flex flex-col items-center justify-center cursor-pointer transition-opacity duration-400 ease-out ${
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
                background showing around the video. */}
            <video
                ref={videoRef}
                src="/brand/nexora-intro.mp4"
                autoPlay
                muted
                playsInline
                onEnded={finish}
                onError={finish}
                className="absolute inset-0 z-10 w-full h-full object-contain"
            />
            <p className="absolute z-20 left-1/2 -translate-x-1/2 bottom-8 text-paper/70 text-xs mt-8 tracking-wide drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
                Tap to skip
            </p>
        </div>
    );
}