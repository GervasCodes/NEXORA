import { useEffect, useRef, useState } from "react";
import Spinner from "./Spinner";
import ProgressBar from "./ProgressBar";
import Button from "./Button";
import useT from "./useT";

/**
 * FullScreenLoader - a blocking overlay for moments the user must not
 * interact through or navigate away from: handing off to a payment
 * gateway, publishing a product, finalising an order. Ordinary data
 * fetches should use skeletons instead.
 *
 *  - `open`      controls visibility.
 *  - `delay`     (ms) hides it for quick actions so it never flashes.
 *  - `progress`  optional 0-100; omit for an indeterminate bar.
 *  - `slowAfter` (ms) shows a "taking longer than usual" note, plus a
 *                Cancel button when `onCancel` is supplied, so people are
 *                never trapped behind it.
 *
 * Locks page scroll while visible and respects safe-area insets (same
 * approach as SplashScreen).
 */
export default function FullScreenLoader({
    open,
    message,
    progress,
    delay = 250,
    slowAfter = 15000,
    onCancel
}) {
    const t = useT();
    const [visible, setVisible] = useState(false);
    const [slow, setSlow] = useState(false);
    const panelRef = useRef(null);

    useEffect(() => {
        if (!open) {
            setVisible(false);
            setSlow(false);
            return undefined;
        }
        const show = setTimeout(() => setVisible(true), delay);
        const slowTimer = setTimeout(() => setSlow(true), slowAfter);
        return () => {
            clearTimeout(show);
            clearTimeout(slowTimer);
        };
    }, [open, delay, slowAfter]);

    useEffect(() => {
        if (!visible) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        panelRef.current?.focus();
        return () => { document.body.style.overflow = prev; };
    }, [visible]);

    if (!open || !visible) return null;

    return (
        <div
            ref={panelRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-busy="true"
            aria-live="polite"
            aria-label={message || t("loader.working")}
            className="fixed inset-0 z-[var(--z-modal)] flex flex-col items-center justify-center bg-abyss/85 backdrop-blur-sm text-frost animate-fade-in focus:outline-none"
            style={{
                height: "100dvh",
                width: "100dvw",
                paddingTop: "env(safe-area-inset-top)",
                paddingBottom: "env(safe-area-inset-bottom)",
                paddingLeft: "env(safe-area-inset-left)",
                paddingRight: "env(safe-area-inset-right)"
            }}
        >
            <div className="flex flex-col items-center gap-5 px-6 text-center max-w-xs w-full">
                <span className="font-display italic text-3xl tracking-tight drop-shadow-[0_2px_16px_rgba(124,58,237,0.5)]" aria-hidden="true">NEXORA</span>
                <Spinner size="lg" tone="mango" />
                <p className="text-sm text-frost/90">{message || t("loader.working")}</p>
                {typeof progress === "number" && (
                    <ProgressBar value={progress} label={t("loader.progress")} showValue className="w-full" />
                )}
                {slow && (
                    <div className="space-y-3 animate-fade-in">
                        <p className="text-xs text-frost/70">{t("loader.slow")}</p>
                        {onCancel && (
                            <Button variant="secondary" size="sm" onClick={onCancel} className="!text-frost !border-frost/40">
                                {t("common.cancel")}
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
