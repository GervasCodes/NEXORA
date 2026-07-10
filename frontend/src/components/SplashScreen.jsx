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
        >
            {/* Full-screen ambient glow — pure CSS, so it's crisp at any
                resolution/screen size with no exported image asset. Colors
                are sampled from the logo's own violet-to-azure gradient. */}
            <div
                className="pointer-events-none absolute -top-1/4 -left-1/4 w-[70vmax] h-[70vmax] rounded-full opacity-40 blur-[120px] animate-pulse"
                style={{ background: "radial-gradient(circle, #7C3AED 0%, transparent 70%)" }}
            />
            <div
                className="pointer-events-none absolute -bottom-1/4 -right-1/4 w-[70vmax] h-[70vmax] rounded-full opacity-40 blur-[120px] animate-pulse"
                style={{ background: "radial-gradient(circle, #1D4ED8 0%, transparent 70%)", animationDelay: "1s" }}
            />

            <video
                ref={videoRef}
                src="/brand/nexora-intro.mp4"
                autoPlay
                muted
                playsInline
                onEnded={finish}
                onError={finish}
                className="relative w-72 sm:w-96 h-auto drop-shadow-[0_0_60px_rgba(110,168,254,0.35)]"
            />
            <p className="relative text-paper/30 text-xs mt-8 tracking-wide">Tap to skip</p>
        </div>
    );
}