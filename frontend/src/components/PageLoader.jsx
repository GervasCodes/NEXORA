
// D1 ( remediation): used on nearly every page while data loads, but
// previously communicated nothing to a screen-reader user - it's a purely
// decorative spinning ring, so silence during a genuine wait read as the
// page being broken. role="status" + a visually-hidden label announces
// "Loading" (politely, without interrupting whatever the user was doing),
// and aria-hidden on the ring itself keeps its decorative divs out of the
// accessibility tree entirely.
import Spinner from "./ui/Spinner";

export default function PageLoader() {
    return (
        <div className="flex items-center justify-center py-24 animate-fade-in [animation-delay:150ms]" role="status">
            <Spinner size="lg" tone="mango" />
            <span className="sr-only">Loading</span>
        </div>
    );
}
