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
            className={`fixed inset-0 z-[100] bg-abyss flex flex-col items-center justify-center cursor-pointer transition-opacity duration-400 ease-out ${
                leaving ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
        >
            <video
                ref={videoRef}
                src="/brand/nexora-intro.mp4"
                autoPlay
                muted
                playsInline
                onEnded={finish}
                onError={finish}
                className="w-56 sm:w-72 h-auto"
            />
            <p className="text-paper/30 text-xs mt-8 tracking-wide">Tap to skip</p>
        </div>
    );
}
