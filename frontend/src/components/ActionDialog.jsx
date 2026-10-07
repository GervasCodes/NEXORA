import { useEffect, useRef, useState } from "react";
import Button from "./ui/Button";

// Replacement for window.prompt() on risky admin actions. Same dialog
// conventions as ConfirmDialog (glass card, role="dialog", Escape cancels,
// focus restored on close), plus the two inputs those actions need:
//   - reasonLabel: a required free-text reason (e.g. why a suspension);
//   - confirmText: the exact phrase the admin must type before the confirm
//     button enables (an email address, "RESET ALL DATA", ...);
//   - passwordLabel: a fresh password entry.
// onConfirm receives { reason, password }. Nothing is sent until the confirm
// button is enabled, so a mistyped phrase can never reach the server.
export default function ActionDialog({
    open,
    title,
    description,
    reasonLabel,
    confirmText,
    confirmTextLabel,
    passwordLabel,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
    busy = false,
    onConfirm,
    onCancel
}) {
    const [reason, setReason] = useState("");
    const [typed, setTyped] = useState("");
    const [password, setPassword] = useState("");
    const firstFieldRef = useRef(null);
    const lastFocusedRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;

        setReason("");
        setTyped("");
        setPassword("");
        lastFocusedRef.current = document.activeElement;
        firstFieldRef.current?.focus();

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

    const reasonOk = !reasonLabel || reason.trim().length > 0;
    const typedOk = !confirmText || typed.trim().toLowerCase() === confirmText.toLowerCase();
    const passwordOk = !passwordLabel || password.length > 0;
    const canConfirm = reasonOk && typedOk && passwordOk && !busy;

    const fieldClass = "w-full border border-line rounded-lg px-3 py-2 text-sm bg-transparent";
    let firstAssigned = false;
    const refFor = () => {
        if (firstAssigned) return undefined;
        firstAssigned = true;
        return firstFieldRef;
    };

    return (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- click-outside-to-dismiss backdrop; keyboard users dismiss via Escape and the Cancel button
        <div
            className="fixed inset-0 z-[var(--z-modal)] bg-abyss/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
            onClick={busy ? undefined : onCancel}
        >
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- stopPropagation only */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="action-dialog-title"
                aria-describedby={description ? "action-dialog-description" : undefined}
                className="glass-strong rounded-xl max-w-md w-full p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <p id="action-dialog-title" className="font-display text-xl mb-1">{title}</p>
                {description && (
                    <p id="action-dialog-description" className="text-sm text-ink/80 mb-4 whitespace-pre-line">{description}</p>
                )}

                {reasonLabel && (
                    <label className="block mb-3 text-sm">
                        <span className="block mb-1">{reasonLabel}</span>
                        <textarea
                            ref={refFor()}
                            rows={3}
                            maxLength={500}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className={fieldClass}
                        />
                    </label>
                )}

                {confirmText && (
                    <label className="block mb-3 text-sm">
                        <span className="block mb-1">
                            {confirmTextLabel || "Type this to confirm:"}{" "}
                            <span className="font-mono font-semibold break-all">{confirmText}</span>
                        </span>
                        <input
                            ref={refFor()}
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            className={fieldClass}
                        />
                    </label>
                )}

                {passwordLabel && (
                    <label className="block mb-3 text-sm">
                        <span className="block mb-1">{passwordLabel}</span>
                        <input
                            ref={refFor()}
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={fieldClass}
                        />
                    </label>
                )}

                <div className="flex gap-3 mt-4">
                    <Button onClick={onCancel} variant="secondary" disabled={busy} className="flex-1 hover:border-ash">
                        {cancelLabel}
                    </Button>
                    <Button
                        ref={!reasonLabel && !confirmText && !passwordLabel ? firstFieldRef : undefined}
                        onClick={() => onConfirm({ reason: reason.trim(), password })}
                        disabled={!canConfirm}
                        className={danger ? "flex-1 !bg-coral !text-frost hover:!bg-coral/90" : "flex-1"}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
