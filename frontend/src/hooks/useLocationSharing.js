import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";

// Pings roughly once a minute, not every few seconds like the delivery
// agent's live tracking ping (useAgentShift.js's LOCATION_PING_MS) -
// this is a background "where are you generally right now" signal for
// the admin map, not a live-tracking feed anyone is watching move in
// real time, so there's no reason to spend battery/data at that rate.
const LOCATION_PING_MS = 60000;

// Phase 5 (map showing users) - opt-out (on by default) background
// location sharing for buyers and sellers, per PHASE1_DECISIONS.md #4's
// override. Mounted once near the app root (see
// LocationSharingListener.jsx) rather than behind any explicit
// "go online" action like the delivery agent's shift toggle - there is
// no shift to start here, sharing is just on unless the account's own
// Settings toggle (Account.jsx -> locationSharingEnabled) turns it off.
//
// The browser's own permission prompt is a separate, unavoidable gate
// on top of this: turning our app-level toggle on doesn't skip it, and
// a person who denies the browser prompt simply never sends a ping
// (locationError below surfaces why, if a caller wants to show it -
// currently unused, silent no-op, since this runs in the background
// with no dedicated UI).
export function useLocationSharing() {
    const { user } = useAuth();
    const { socket, connected } = useSocket();
    const watchIdRef = useRef(null);
    const intervalRef = useRef(null);
    const lastCoordsRef = useRef(null);

    const eligibleRole = user?.role === "buyer" || user?.role === "seller";
    // Column defaults to opt-out (see migration 105) - undefined only
    // happens for a user object read before their profile ever loaded
    // this field, so default to "on" the same way the column itself
    // does, rather than treating "not loaded yet" as "opted out".
    const sharingEnabled = user?.location_sharing_enabled !== false;

    useEffect(() => {
        const stop = () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };

        if (!eligibleRole || !sharingEnabled || !connected || !socket) {
            stop();
            return stop;
        }

        if (!navigator.geolocation) {
            return undefined;
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                lastCoordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            },
            () => { /* silent - no dedicated UI to surface this in yet */ },
            { enableHighAccuracy: false, maximumAge: 30000 }
        );

        intervalRef.current = setInterval(() => {
            if (lastCoordsRef.current && socket.connected) {
                socket.emit("user:location", lastCoordsRef.current);
            }
        }, LOCATION_PING_MS);

        return stop;
    }, [eligibleRole, sharingEnabled, connected, socket]);
}
