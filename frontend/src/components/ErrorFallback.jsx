import { Link } from "react-router-dom";
import Button from "./ui/Button";

/**
 * Error-boundary fallback - Phase 2 Metadata & Error Polish.
 *
 * Replaces the bare `<p>Something went wrong...</p>` that main.jsx's
 * Sentry.ErrorBoundary previously rendered. Reuses the same visual
 * pattern as App.jsx's 404 route (max-w-lg centered block, font-display
 * heading, text-ash subtext, primary Button CTA) so an app crash and a
 * missing page look like they belong to the same product instead of one
 * looking designed and the other looking abandoned.
 *
 * Rendered in place of <App /> itself (see main.jsx), so it deliberately
 * doesn't assume Header/Footer are present - it's a full standalone
 * screen. It *can* safely use react-router's <Link>/useNavigate and the
 * shared Button component, since all the context providers (including
 * BrowserRouter) wrap the ErrorBoundary in main.jsx, not the other way
 * around - only <App> itself might have crashed.
 *
 * "Reload page" is offered alongside "Go to Home" because a render crash
 * is often caused by stale in-memory state (e.g. a bad response shape
 * after a deploy) that a client-side navigation won't clear, but a full
 * reload will.
 */
export default function ErrorFallback() {
    return (
        <div className="max-w-lg mx-auto py-24 px-6 text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-coral/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-coral">
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                </svg>
            </div>
            <p className="font-display text-2xl mb-2">Something went wrong</p>
            <p className="text-ash text-sm mb-6">
                We hit an unexpected error. Reloading usually fixes it - if it
                keeps happening, head back to the homepage and try again from
                there.
            </p>
            <div className="flex gap-3 justify-center">
                <Button variant="secondary" onClick={() => window.location.reload()}>
                    Reload page
                </Button>
                <Button as={Link} to="/">
                    Go to Home
                </Button>
            </div>
        </div>
    );
}
