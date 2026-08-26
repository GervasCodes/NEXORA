import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta";
import Button from "../components/ui/Button";

// Phase 6 (New UI/UX & Imagery Additions, item 22): extracted from the
// inline `<Route path="*">` fallback in App.jsx into a real page so it
// gets its own PageMeta and is styled consistently with the rest of the
// app instead of being a bare, unstyled router fallback. The illustration
// is an inline SVG (a lost/compass motif) rather than a placeholder
// <img> - unlike Home.jsx's hero or OnboardingTour's steps, a 404 page
// doesn't need real photography, and an SVG scales cleanly at any size
// with no asset to source.
export default function NotFound() {
    return (
        <div className="max-w-lg mx-auto py-24 px-6 text-center">
            <PageMeta title="Page not found" noIndex />
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                className="w-20 h-20 mx-auto mb-6 text-line"
            >
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 14.5l2.2-5 2.8 2-2.2 5-2.8-2Z" />
                <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
            </svg>
            <p className="font-display text-2xl mb-2">Page not found</p>
            <p className="text-ash text-sm mb-6">The page you're looking for doesn't exist or may have moved.</p>
            <Button as={Link} to="/">
                Go to Home
            </Button>
        </div>
    );
}
