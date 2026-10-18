import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext";

// Round 5, phase 7: Google Identity Services button.
//
// Renders nothing at all unless VITE_GOOGLE_CLIENT_ID is set, so a deploy
// without Google configured simply doesn't show the button. The script comes
// from accounts.google.com, which public/_headers allows (script-src,
// frame-src, connect-src, style-src).
//
// onCredential(idToken) is called with Google's signed ID token; verifying it
// and creating/linking the account is the backend's job (POST /auth/google).

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const BUTTON_MIN_WIDTH = 200;
const BUTTON_MAX_WIDTH = 400; // Google's own limit

let scriptPromise = null;
const loadGoogleScript = () => {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (!scriptPromise) {
        scriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = GIS_SRC;
            script.async = true;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => {
                scriptPromise = null; // allow a retry on the next mount
                reject(new Error("Google script failed to load"));
            };
            document.head.appendChild(script);
        });
    }
    return scriptPromise;
};

export const isGoogleSignInConfigured = Boolean(GOOGLE_CLIENT_ID);

/**
 * @param {"signin_with"|"signup_with"|"continue_with"} text
 */
export default function GoogleSignInButton({ onCredential, text = "continue_with", disabled = false }) {
    const { language, t } = useLanguage();
    const containerRef = useRef(null);
    const callbackRef = useRef(onCredential);
    const [failed, setFailed] = useState(false);

    // Always call the latest handler without re-initialising Google.
    useEffect(() => {
        callbackRef.current = onCredential;
    }, [onCredential]);

    useEffect(() => {
        if (!GOOGLE_CLIENT_ID) return undefined;
        let cancelled = false;

        loadGoogleScript()
            .then(() => {
                if (cancelled || !containerRef.current || !window.google?.accounts?.id) return;

                window.google.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: (response) => {
                        if (response?.credential) callbackRef.current?.(response.credential);
                    },
                    auto_select: false,
                    itp_support: true
                });

                const width = Math.min(
                    BUTTON_MAX_WIDTH,
                    Math.max(BUTTON_MIN_WIDTH, containerRef.current.offsetWidth || BUTTON_MAX_WIDTH)
                );
                containerRef.current.innerHTML = "";
                window.google.accounts.id.renderButton(containerRef.current, {
                    type: "standard",
                    theme: "outline",
                    size: "large",
                    shape: "rectangular",
                    text,
                    width,
                    locale: language === "sw" ? "sw" : "en"
                });
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });

        return () => {
            cancelled = true;
        };
    }, [language, text]);

    if (!GOOGLE_CLIENT_ID) return null;

    return (
        <div className={disabled ? "opacity-60 pointer-events-none" : ""} aria-disabled={disabled || undefined}>
            <div ref={containerRef} className="flex justify-center min-h-[44px]" />
            {failed && <p role="alert" className="text-xs text-coral mt-2 text-center">{t("auth.google.loadFailed")}</p>}
        </div>
    );
}
