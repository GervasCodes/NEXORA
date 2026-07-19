import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/ToastContext";
import { formatDate } from "../utils/format";

const POLL_INTERVAL_MS = 30000;

// Bell icon + dropdown feed for the backend's notification module
// (GET /notifications, /unread-count, PUT /:id/read, /read-all) - this
// previously had no frontend surface at all. Polls rather than opening a
// dedicated socket channel: notifications are inherently low-frequency
// (order/dispute/wallet events), so a 30s poll is plenty fresh without
// adding another realtime connection on top of the chat/tracking sockets.
export default function NotificationBell() {
    const { user } = useAuth();
    const { t, language } = useLanguage();
    const toast = useToast();
    const navigate = useNavigate();

    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const [loading, setLoading] = useState(false);
    const [justBumped, setJustBumped] = useState(false);
    const rootRef = useRef(null);
    const prevUnreadRef = useRef(0);

    const fetchUnread = useCallback(async () => {
        try {
            const { data } = await api.get("/notifications/unread-count");
            const count = data.data.unread;
            if (count > prevUnreadRef.current) setJustBumped(true);
            prevUnreadRef.current = count;
            setUnread(count);
        } catch {
            // Silent - a missed poll tick isn't worth surfacing an error toast for.
        }
    }, []);

    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/notifications");
            setItems(data.data);
        } catch {
            toast?.error(t("common.somethingWentWrong") || "Something went wrong.");
        } finally {
            setLoading(false);
        }
    }, [toast, t]);

    useEffect(() => {
        if (!user) return;
        fetchUnread();
        const interval = setInterval(fetchUnread, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
        // Re-poll immediately (and re-fetch under the new language) whenever
        // the account's chosen language changes, since notification text is
        // rendered server-side in that language.
    }, [user, language, fetchUnread]);

    useEffect(() => {
        if (open) fetchList();
    }, [open, fetchList]);

    useEffect(() => {
        if (!justBumped) return;
        const timer = setTimeout(() => setJustBumped(false), 700);
        return () => clearTimeout(timer);
    }, [justBumped]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    if (!user) return null;

    const handleItemClick = async (item) => {
        setOpen(false);
        if (!item.is_read) {
            setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
            setUnread((c) => Math.max(0, c - 1));
            api.put(`/notifications/${item.id}/read`).catch(() => {});
        }
        if (item.related_order_id) navigate(`/orders/${item.related_order_id}`);
    };

    const handleMarkAllRead = async () => {
        const hadUnread = unread > 0;
        setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
        setUnread(0);
        try {
            await api.put("/notifications/read-all");
        } catch {
            if (hadUnread) toast?.error(t("common.somethingWentWrong") || "Something went wrong.");
        }
    };

    return (
        <div className="relative" ref={rootRef}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label={t("notifications.title")}
                aria-expanded={open}
                className={`relative text-paper/90 hover:text-azure-light transition-colors shrink-0 ${justBumped ? "animate-ring-once" : ""}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unread > 0 && (
                    <span className={`absolute -top-1.5 -right-1.5 bg-coral text-paper text-[10px] font-mono font-semibold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center ${justBumped ? "animate-pop-in" : ""}`}>
                        {unread > 99 ? "99+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-3 w-80 max-w-[90vw] glass-strong text-ink rounded-lg shadow-xl border border-line/60 overflow-hidden animate-scale-in origin-top-right z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-line/60">
                        <p className="text-sm font-semibold">{t("notifications.title")}</p>
                        {unread > 0 && (
                            <button onClick={handleMarkAllRead} className="text-xs text-teal hover:underline">
                                {t("notifications.markAllRead")}
                            </button>
                        )}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {loading && (
                            <div className="p-4 space-y-3">
                                {[0, 1, 2].map((i) => (
                                    <div key={i} className="flex gap-2 animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                                        <div className="skeleton animate-shimmer rounded-full w-2 h-2 mt-1.5 shrink-0" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="skeleton animate-shimmer rounded h-3 w-3/4" />
                                            <div className="skeleton animate-shimmer rounded h-3 w-1/2" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {!loading && items.length === 0 && (
                            <p className="text-sm text-ash text-center py-10 px-4">{t("notifications.empty")}</p>
                        )}

                        {!loading && items.map((item, i) => (
                            <button
                                key={item.id}
                                onClick={() => handleItemClick(item)}
                                className="w-full text-left px-4 py-3 border-b border-line/40 last:border-0 hover:bg-line/20 transition-colors flex gap-2.5 animate-fade-in"
                                style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}
                            >
                                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.is_read ? "bg-transparent" : "bg-teal"}`} />
                                <span className="flex-1 min-w-0">
                                    <span className={`block text-sm truncate ${item.is_read ? "text-ink/70" : "text-ink font-medium"}`}>
                                        {item.title}
                                    </span>
                                    <span className="block text-xs text-ash line-clamp-2 mt-0.5">{item.message}</span>
                                    <span className="block text-[11px] text-ash/70 mt-1">{formatDate(item.created_at)}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
