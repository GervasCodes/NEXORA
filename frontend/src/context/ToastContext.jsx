import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);

const TYPE_STYLES = {
    success: { border: "border-teal/30", icon: "text-teal", dot: "bg-teal" },
    error: { border: "border-coral/30", icon: "text-coral", dot: "bg-coral" },
    info: { border: "border-azure/30", icon: "text-azure-deep", dot: "bg-azure" }
};

function ToastIcon({ type }) {
    if (type === "success") {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
                <path d="M20 6 9 17l-5-5" />
            </svg>
        );
    }
    if (type === "error") {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
        </svg>
    );
}

function ToastItem({ toast, onClose }) {
    const [leaving, setLeaving] = useState(false);
    const style = TYPE_STYLES[toast.type] || TYPE_STYLES.info;

    const close = useCallback(() => {
        setLeaving(true);
        setTimeout(onClose, 180);
    }, [onClose]);

    // Auto-dismiss, but pause the timer conceptually isn't needed here -
    // these are short confirmations, not action-required alerts.
    useEffect(() => {
        const dismissTimer = setTimeout(close, toast.duration);
        return () => clearTimeout(dismissTimer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            role="status"
            className={`glass-strong border ${style.border} rounded-lg px-4 py-3 shadow-lg flex items-start gap-2.5 pointer-events-auto
                transition-all duration-200 ${leaving ? "opacity-0 translate-y-1 scale-95" : "opacity-100 translate-y-0 scale-100 animate-slide-up"}`}
        >
            <span className={style.icon}><ToastIcon type={toast.type} /></span>
            <p className="text-sm text-ink flex-1 min-w-0">{toast.message}</p>
            <button onClick={close} aria-label="Dismiss" className="text-ash hover:text-ink transition-colors shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const idRef = useRef(0);

    const show = useCallback((message, type = "info", duration = 4000) => {
        const id = ++idRef.current;
        setToasts((prev) => [...prev, { id, message, type, duration }]);
        return id;
    }, []);

    const dismiss = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const value = useMemo(() => ({
        show,
        success: (msg, duration) => show(msg, "success", duration),
        error: (msg, duration) => show(msg, "error", duration),
        info: (msg, duration) => show(msg, "info", duration)
    }), [show]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:bottom-4 z-[1000] flex flex-col gap-2 sm:w-80 pointer-events-none">
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} toast={toast} onClose={() => dismiss(toast.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export const useToast = () => useContext(ToastContext);
