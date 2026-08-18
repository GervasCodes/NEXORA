import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";
import { formatDate } from "../utils/format";

const POLL_INTERVAL_MS = 30000;

// Severity dot color - kept as a lookup rather than inline ternary chains
// so a future severity value fails visibly (undefined class) instead of
// silently falling through to the wrong color.
const SEVERITY_DOT = {
    info: "bg-teal",
    warning: "bg-mango",
    critical: "bg-coral"
};

// Mirrors NotificationBell.jsx's structure and polling/read-state
// behavior, but points at the admin notification center (/admin/notifications)
// instead of the per-user one, and is unread/read as a SHARED team inbox -
// any admin marking an item read clears it for every admin, not just the
// one who clicked it (see migration 059's admin_notifications table).
//
// The admin panel doesn't use the customer-facing i18n system (see
// AdminLayout.jsx, AdminUsers.jsx, etc. - all plain English), so this
// component's copy is hardcoded English too, matching its surroundings.
export default function AdminNotificationBell() {
    const { user, sessionReady } = useAuth();
    const { socket } = useSocket();
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
            const { data } = await api.get("/admin/notifications/unread-count");
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
            const { data } = await api.get("/admin/notifications");
            setItems(data.data);
        } catch {
            toast?.error("Something went wrong.");
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (user?.role !== "admin" || !sessionReady) return;
        fetchUnread();
        const interval = setInterval(fetchUnread, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [user, sessionReady, fetchUnread]);

    // Real-time: same reasoning as NotificationBell.jsx - the poll above
    // is a fallback, this is what makes the shared admin inbox update the
    // instant adminNotificationService.notify() fires (new dispute, fraud
    // flag, registration, admin login, etc.), without a 30s delay.
    useEffect(() => {
        if (user?.role !== "admin" || !socket) return undefined;

        const handleNew = (notification) => {
            prevUnreadRef.current += 1;
            setUnread((c) => c + 1);
            setJustBumped(true);
            setItems((prev) => (prev.length > 0 || open ? [notification, ...prev] : prev));
        };

        socket.on("admin_notification:new", handleNew);
        return () => socket.off("admin_notification:new", handleNew);
    }, [user, socket, open]);

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

    if (user?.role !== "admin") return null;

    const handleItemClick = async (item) => {
        setOpen(false);
        if (!item.is_read) {
            setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
            setUnread((c) => Math.max(0, c - 1));
            api.put(`/admin/notifications/${item.id}/read`).catch(() => {});
        }
        if (item.related_user_id) {
            navigate(item.type.startsWith("admin_") ? "/admin/admins" : "/admin/users");
        }
    };

    const handleMarkAllRead = async () => {
        const hadUnread = unread > 0;
        setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
        setUnread(0);
        try {
            await api.put("/admin/notifications/read-all");
        } catch {
            if (hadUnread) toast?.error("Something went wrong.");
        }
    };

    return (
        <div className="relative" ref={rootRef}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label="Admin notifications"
                aria-expanded={open}
                className={`relative text-frost/90 hover:text-azure-light transition-colors shrink-0 ${justBumped ? "animate-ring-once" : ""}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6">
                    <path d="M12 2 2 7l10 5 10-5-10-5Z" />
                    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
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
                        <p className="text-sm font-semibold">Admin notifications</p>
                        {unread > 0 && (
                            <button onClick={handleMarkAllRead} className="text-xs text-teal hover:underline">
                                Mark all read
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
                            <p className="text-sm text-ash text-center py-10 px-4">No notifications yet.</p>
                        )}

                        {!loading && items.map((item, i) => (
                            <button
                                key={item.id}
                                onClick={() => handleItemClick(item)}
                                className="w-full text-left px-4 py-3 border-b border-line/40 last:border-0 hover:bg-line/20 transition-colors flex gap-2.5 animate-fade-in"
                                style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}
                            >
                                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.is_read ? "bg-transparent" : SEVERITY_DOT[item.severity] || "bg-teal"}`} />
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
