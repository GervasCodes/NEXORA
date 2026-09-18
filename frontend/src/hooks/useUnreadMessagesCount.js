import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api/client";

const POLL_INTERVAL_MS = 45000;
// Phase 5 (production error fixes): these polls were periodically
// failing with ERR_QUIC_PROTOCOL_ERROR / QUIC_NETWORK_IDLE_TIMEOUT on
// flaky mobile connections - a per-request timeout means a stalled poll
// fails fast and cleanly instead of hanging until the browser's own
// (much longer) network-level timeout kicks in.
const REQUEST_TIMEOUT_MS = 10000;

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
        api.get("/chat/unread-count", { timeout: REQUEST_TIMEOUT_MS })
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
