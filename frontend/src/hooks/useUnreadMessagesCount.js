import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api/client";

const POLL_INTERVAL_MS = 30000;

// Total unread-message count for the "Messages" nav badge, shared between
// Header.jsx (buyer nav + buyer mobile bottom nav) and SellerLayout.jsx
// (seller mobile bottom nav) so both stay in sync with the same polling
// logic instead of drifting apart. Same interval-poll approach
// NotificationBell already uses for its own badge.
//
// `enabled` should be false for any role that never sees a "/messages"
// link (delivery agents, admins, signed-out visitors) - there's no point
// polling for a badge nobody can see.
export function useUnreadMessagesCount(enabled) {
    const [unreadCount, setUnreadCount] = useState(0);
    const location = useLocation();

    const refresh = useCallback(() => {
        if (!enabled) return;
        api.get("/chat/unread-count")
            .then(({ data }) => setUnreadCount(data.data.unread))
            .catch(() => {});
    }, [enabled]);

    useEffect(() => {
        if (!enabled) {
            setUnreadCount(0);
            return;
        }
        refresh();
        const interval = setInterval(refresh, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [enabled, refresh]);

    // Visiting the thread list (or a conversation) is what marks messages
    // read server-side, so re-check the count on the way back out instead
    // of leaving the badge stale until the next poll tick.
    useEffect(() => {
        if (enabled && !location.pathname.startsWith("/messages")) {
            refresh();
        }
    }, [location.pathname, enabled, refresh]);

    return unreadCount;
}
