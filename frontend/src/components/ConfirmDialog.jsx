import { useEffect, useRef } from "react";

// Small reusable confirm dialog - same dialog conventions as
// IncomingOfferModal.jsx (glass-strong card, role="dialog", Escape to
// cancel, focus moved to the dialog and restored on close) so it feels
// like an existing part of the app rather than a bolted-on alert().
// Phase 4: first used by Header.jsx to confirm sign-out, but written
// generically so any future "are you sure" moment can reuse it instead
// of a browser-native window.confirm().
export default function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
    onConfirm,
    onCancel
}) {
    const confirmRef = useRef(null);
    const lastFocusedRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;

        lastFocusedRef.current = document.activeElement;
        confirmRef.current?.focus();

        const handleKeyDown = (e) => {
            if (e.key === "Escape") onCancel();
        };
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            lastFocusedRef.current?.focus?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[1200] bg-abyss/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
            onClick={onCancel}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                aria-describedby={description ? "confirm-dialog-description" : undefined}
                className="glass-strong rounded-xl max-w-sm w-full p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <p id="confirm-dialog-title" className="font-display text-xl mb-1">{title}</p>
                {description && (
                    <p id="confirm-dialog-description" className="text-sm text-ink/80 mb-4">{description}</p>
                )}

                <div className={`flex gap-3 ${description ? "" : "mt-4"}`}>
                    <button
                        onClick={onCancel}
                        className="flex-1 border border-line py-2.5 rounded-md text-sm font-medium hover:border-ash transition-colors focus-ring"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        ref={confirmRef}
                        onClick={onConfirm}
                        className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-colors focus-ring ${
                            danger
                                ? "bg-coral text-frost hover:bg-coral/90"
                                : "bg-mango text-abyss hover:bg-mango-dark"
                        }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
