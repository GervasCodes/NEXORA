// One bottom-end region for floating launchers (AI assistant, support).
// Children stack top-to-bottom, so the order passed in is the visual order.
// Sits above the mobile bottom nav via the same safe-area offset each child
// used before, and uses the shared --z-float token.
export default function FloatingActions({ children }) {
    return (
        <div className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6 z-[var(--z-float)] flex flex-col items-end gap-3 pointer-events-none">
            <div className="pointer-events-auto flex flex-col items-end gap-3">
                {children}
            </div>
        </div>
    );
}
