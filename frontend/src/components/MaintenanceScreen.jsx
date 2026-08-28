import { Link } from "react-router-dom";
import { formatDateTime } from "../utils/format";
import { BackArrowIcon } from "./Icons";

// Shown in place of a single page/section's content when the admin has
// put that department, service, or module into maintenance mode (see
// Admin Panel -> Maintenance). Deliberately page-scoped rather than a
// full-screen takeover like SuspendedScreen.jsx - the rest of the app
// stays usable, only the affected section is swapped out.
//
// Visual language: same fade/slide/pop-in choreography as ComingSoon.jsx
// and SuspendedScreen.jsx for consistency, but its own animated mark - a
// slowly rotating gear behind a steady wrench, with a soft pulsing halo -
// so "temporarily under maintenance" reads distinctly from "not built
// yet" (ComingSoon) or "account suspended" (SuspendedScreen) at a glance.
export default function MaintenanceScreen({
    title = "Under maintenance",
    message = "This is temporarily unavailable while we make some improvements. Please check back soon.",
    estimatedReturn,
    onRetry
}) {
    return (
        <div className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6 py-16">
            <div className="max-w-md w-full text-center animate-fade-in">
                <div className="relative mx-auto mb-6 w-24 h-24">
                    <span className="absolute inset-0 rounded-full bg-mango/10 animate-pulse" />

                    {/* Slowly rotating gear ring behind the wrench - continuous
                        motion reads as "work in progress" rather than "broken". */}
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="absolute inset-0 m-auto w-16 h-16 text-mango/40 animate-[spin_6s_linear_infinite]"
                        aria-hidden="true"
                    >
                        <path
                            d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 2v2.2M12 19.8V22M4.9 4.9l1.55 1.55M17.55 17.55 19.1 19.1M2 12h2.2M19.8 12H22M4.9 19.1l1.55-1.55M17.55 6.45 19.1 4.9"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                        />
                    </svg>

                    <div className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-mango/15 flex items-center justify-center">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            className="w-6 h-6 text-mango-dark"
                            aria-hidden="true"
                        >
                            <path
                                d="M14.7 6.3a4 4 0 0 1-5.1 5.1L4.8 16.2a1.6 1.6 0 0 0 2.3 2.3l4.8-4.8a4 4 0 0 1 5.1-5.1l-2.2 2.2-1.6-.4-.4-1.6 2.2-2.2Z"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        </svg>
                    </div>
                </div>

                <span className="inline-block text-[10px] uppercase tracking-wide font-semibold text-mango-dark bg-mango/10 rounded-full px-3 py-1 mb-4 animate-pop-in">
                    Under maintenance
                </span>

                <h1 className="font-display text-2xl sm:text-3xl text-ink mb-2 animate-slide-up">
                    {title}
                </h1>
                <p className="text-ash text-sm leading-relaxed mb-2 animate-slide-up" style={{ animationDelay: "80ms" }}>
                    {message}
                </p>
                {estimatedReturn && (
                    <p className="text-xs text-mango-dark mb-6 animate-slide-up" style={{ animationDelay: "100ms" }}>
                        Expected back {formatDateTime(estimatedReturn)}
                    </p>
                )}
                {!estimatedReturn && <div className="mb-8" />}

                <div className="flex items-center justify-center gap-3 animate-slide-up" style={{ animationDelay: "140ms" }}>
                    {onRetry && (
                        <button
                            onClick={onRetry}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-frost bg-mango hover:bg-mango-dark transition-colors rounded-lg px-5 py-2.5"
                        >
                            Try again
                        </button>
                    )}
                    <Link
                        to="/"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink/80 hover:text-ink transition-colors rounded-lg px-5 py-2.5 border border-line/60"
                    >
                        <BackArrowIcon className="w-4 h-4" /> Back to home
                    </Link>
                </div>
            </div>
        </div>
    );
}
