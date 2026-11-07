/**
 * Phone-only sticky action bar (Phase 8). Same pattern as the mobile buy bar
 * on ProductDetail: hidden from md up, pinned above the safe area through
 * --bottom-inset (index.css), z-[var(--z-float)], with a spacer so the last
 * content is never hidden behind it.
 *
 * Children are the bar's contents (usually a price block and/or one button).
 */
export default function StickyMobileCta({ children, className = "" }) {
    return (
        <>
            <div className="h-20 md:hidden" aria-hidden="true" />
            <div
                className={`md:hidden fixed inset-x-0 bottom-[var(--bottom-inset)] z-[var(--z-float)] bg-paper/95 backdrop-blur border-t border-line px-4 py-3 flex items-center gap-3 ${className}`.trim()}
            >
                {children}
            </div>
        </>
    );
}
