import { useState } from "react";
import usePullToRefresh, { isTouchDevice, prefersReducedMotion } from "../../hooks/usePullToRefresh";
import Spinner from "./Spinner";
import Button from "./Button";
import useT from "./useT";

/**
 * PullToRefresh - wraps a page body. On touch devices pulling down at the
 * top of the page shows an arrow that turns into a Spinner and calls
 * `onRefresh()` (return a promise so the indicator stays until it
 * resolves). Existing content stays on screen throughout - pair it with a
 * refetch that doesn't flip the page back to a skeleton (useFetch's
 * `refresh`).
 *
 * Touch devices with reduced-motion on get a plain "Refresh" button
 * instead of the gesture; non-touch devices get neither.
 */
export default function PullToRefresh({ onRefresh, enabled = true, children, className = "" }) {
    const t = useT();
    const { containerRef, pull, status, active } = usePullToRefresh({ onRefresh, enabled });
    const [manualBusy, setManualBusy] = useState(false);

    const showManual = enabled && !active && isTouchDevice() && prefersReducedMotion();
    const runManual = async () => {
        setManualBusy(true);
        try { await onRefresh?.(); } finally { setManualBusy(false); }
    };

    const label = status === "ready" ? t("ptr.release")
        : status === "refreshing" ? t("ptr.refreshing")
        : status === "done" ? t("ptr.updated")
        : t("ptr.pull");

    return (
        <div ref={containerRef} className={className}>
            {showManual && (
                <div className="flex justify-end px-4 pt-2">
                    <Button variant="ghost" size="sm" loading={manualBusy} onClick={runManual}>{t("ptr.refresh")}</Button>
                </div>
            )}
            {active && (
                <div
                    aria-hidden={pull === 0}
                    role={pull > 0 ? "status" : undefined}
                    className="overflow-hidden flex items-end justify-center text-ash text-xs"
                    style={{ height: pull, transition: status === "pulling" || status === "ready" ? "none" : "height 0.25s ease-out" }}
                >
                    {pull > 0 && (
                        <div className="flex items-center gap-2 pb-2">
                            {status === "refreshing" ? (
                                <Spinner size="sm" tone="mango" />
                            ) : status === "done" ? (
                                <svg viewBox="0 0 24 24" className="w-4 h-4 text-teal" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M5 12l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            ) : (
                                <svg
                                    viewBox="0 0 24 24"
                                    className="w-4 h-4 transition-transform duration-150"
                                    style={{ transform: status === "ready" ? "rotate(180deg)" : "none" }}
                                    fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
                                >
                                    <path d="M12 5v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                            <span>{label}</span>
                        </div>
                    )}
                </div>
            )}
            {children}
        </div>
    );
}
