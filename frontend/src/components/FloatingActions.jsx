// One bottom-end region for floating launchers (AI assistant, support).
// Children stack top-to-bottom, so the order passed in is the visual order.
// Clears the iPhone home-indicator safe area and uses the shared
// --z-float token.
export default function FloatingActions({ children }) {
    return (
        <div className="fixed right-4 bottom-[calc(1rem+var(--bottom-inset))] z-[var(--z-float)] flex flex-col items-end gap-3 pointer-events-none">
            <div className="pointer-events-auto flex flex-col items-end gap-3">
                {children}
            </div>
        </div>
    );
}
