
// D1 (Phase 4 remediation): used on nearly every page while data loads, but
// previously communicated nothing to a screen-reader user - it's a purely
// decorative spinning ring, so silence during a genuine wait read as the
// page being broken. role="status" + a visually-hidden label announces
// "Loading" (politely, without interrupting whatever the user was doing),
// and aria-hidden on the ring itself keeps its decorative divs out of the
// accessibility tree entirely.
export default function PageLoader() {
    return (
        <div className="flex items-center justify-center py-24 animate-fade-in [animation-delay:150ms]" role="status">
            <div className="relative w-9 h-9" aria-hidden="true">
                <div className="absolute inset-0 border-2 border-line rounded-full" />
                <div className="absolute inset-0 border-2 border-transparent border-t-mango rounded-full animate-spin" />
            </div>
            <span className="sr-only">Loading</span>
        </div>
    );
}
