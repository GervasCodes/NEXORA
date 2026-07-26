// Full-screen page shown in place of the entire app the moment this
// account is known to be suspended - whether that's discovered at login
// (AuthContext#login) or mid-session, from any already-open page, via the
// api/client.js response interceptor. Deliberately has no way to "get
// back into" the app short of a fresh login as a different, non-suspended
// account - the "Back to sign in" link below just clears local suspension
// state so a page reload doesn't feel stuck.
//
// Visual language matches SplashScreen.jsx (fixed full-bleed dark stage,
// ambient radial glow, safe-area insets for notches/home-indicators) but
// in the coral/danger palette instead of the brand azure, and with a
// pulsing lock icon instead of the logo animation.
export default function SuspendedScreen({ reason, onBack }) {
    return (
        <div
            className="fixed inset-0 z-[200] bg-abyss overflow-hidden flex flex-col items-center justify-center px-6 text-center"
            style={{
                height: "100dvh",
                width: "100dvw",
                paddingTop: "env(safe-area-inset-top)",
                paddingBottom: "env(safe-area-inset-bottom)",
                paddingLeft: "env(safe-area-inset-left)",
                paddingRight: "env(safe-area-inset-right)"
            }}
        >
            <div
                className="pointer-events-none absolute -top-1/4 -right-1/4 w-[90vmax] h-[90vmax] rounded-full opacity-30 blur-[120px] animate-pulse"
                style={{ background: "radial-gradient(circle, #E5484D 0%, transparent 70%)" }}
            />

            <div className="relative max-w-md w-full animate-fade-in">
                <div className="relative mx-auto mb-7 w-24 h-24">
                    {/* Expanding ring pulses outward from behind the lock,
                        giving the page continuous motion ("animated page")
                        without being distracting to sit with. */}
                    <span className="absolute inset-0 rounded-full border border-coral/40 animate-suspend-ring" />
                    <span className="absolute inset-0 rounded-full border border-coral/40 animate-suspend-ring" style={{ animationDelay: "1s" }} />
                    <div className="absolute inset-0 m-auto w-24 h-24 rounded-full bg-coral/15 flex items-center justify-center">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            className="w-10 h-10 text-coral"
                            aria-hidden="true"
                        >
                            <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </div>
                </div>

                <span className="inline-block text-[10px] uppercase tracking-wide font-semibold text-coral bg-coral/10 rounded-full px-3 py-1 mb-4 animate-pop-in">
                    Account suspended
                </span>

                <h1 className="font-display text-2xl sm:text-3xl text-frost mb-3 animate-slide-up">
                    This account has been suspended.
                </h1>

                {reason && (
                    <p className="text-ash text-sm leading-relaxed mb-2 animate-slide-up" style={{ animationDelay: "80ms" }}>
                        Reason given: {reason}
                    </p>
                )}

                <p className="text-ash text-sm leading-relaxed mb-8 animate-slide-up" style={{ animationDelay: "140ms" }}>
                    You won't be able to sign in or use NEXORA while this is in effect.
                    If you believe this is a mistake, please contact support.
                </p>

                <button
                    onClick={onBack}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-frost bg-coral hover:bg-coral/90 transition-colors rounded-lg px-5 py-2.5 animate-slide-up"
                    style={{ animationDelay: "200ms" }}
                >
                    Back to sign in
                </button>
            </div>
        </div>
    );
}
