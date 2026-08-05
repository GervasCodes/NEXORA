import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useSocket } from "../context/SocketContext";
import { enablePushNotifications, disablePushNotifications } from "../utils/push";

const LOCATION_PING_MS = 8000;

export function useAgentShift() {
    const { socket, connected } = useSocket();
    const [online, setOnline] = useState(false);
    const [locationError, setLocationError] = useState("");
    const [pushWarning, setPushWarning] = useState("");
    const watchIdRef = useRef(null);
    const intervalRef = useRef(null);
    const lastCoordsRef = useRef(null);
    // Tracks whether we've already started geolocation watching for the
    // current "online" stretch, so both the manual toggle and the
    // mount-time hydration effect below can safely call the same
    // start-watching logic without double-starting it.
    const watchingRef = useRef(false);

    const stopWatching = useCallback(() => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        watchingRef.current = false;
    }, []);

    const goOffline = useCallback(async () => {
        stopWatching();
        setOnline(false);
        setPushWarning("");
        socket?.emit("agent:offline");
        try { await api.put("/delivery/online", { isOnline: false }); } catch { /* best effort */ }
        await disablePushNotifications().catch(() => {});
    }, [socket, stopWatching]);

    // The actual "start watching position + tell the server we're on
    // shift" logic - extracted so both the manual toggle (goOnline) and
    // the mount-time hydration effect (which restores shift status after
    // a refresh) can share it instead of duplicating the geolocation
    // setup.
    const startShift = useCallback(async ({ announce } = { announce: true }) => {
        if (watchingRef.current) return;

        if (!navigator.geolocation) {
            setLocationError("This device/browser doesn't support location sharing.");
            return;
        }
        setLocationError("");
        watchingRef.current = true;

        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                lastCoordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            },
            () => setLocationError("Couldn't read your location — check location permissions."),
            { enableHighAccuracy: true, maximumAge: 5000 }
        );

        intervalRef.current = setInterval(() => {
            if (lastCoordsRef.current && socket?.connected) {
                socket.emit("agent:location", lastCoordsRef.current);
            }
        }, LOCATION_PING_MS);

        setOnline(true);

        if (announce) {
            socket?.emit("agent:online");
            try { await api.put("/delivery/online", { isOnline: true }); } catch { /* best effort */ }
        }

        const pushResult = await enablePushNotifications();
        setPushWarning(pushResult.success ? "" : pushResult.message);
    }, [socket]);

    const goOnline = useCallback(() => startShift({ announce: true }), [startShift]);

    // Hydrate shift status on mount/reconnect instead of always defaulting
    // to "off" - this is the actual fix for the toggle turning off after
    // a page refresh. GET /delivery/online returns the persisted value;
    // if the agent was already on shift (including through the socket's
    // reconnect grace period - see backend/src/socket/socket.js), resume
    // watching/pinging without re-announcing (the server already knows).
    useEffect(() => {
        if (!connected) return;

        let cancelled = false;

        api.get("/delivery/online")
            .then(({ data }) => {
                if (!cancelled && data?.data?.isOnline && !watchingRef.current) {
                    startShift({ announce: false });
                }
            })
            .catch(() => { /* best effort - falls back to manual toggle */ });

        return () => { cancelled = true; };
        // Only re-run when the socket (re)connects, e.g. after a refresh
        // or a login/logout session change - not on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected]);

    useEffect(() => {
        if (!connected && online) {
            stopWatching();
            setOnline(false);
        }
    }, [connected, online, stopWatching]);

    useEffect(() => stopWatching, [stopWatching]);

    return { online, goOnline, goOffline, locationError, pushWarning };
}
