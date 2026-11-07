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
    // Always-current socket/online for timers and callbacks, so a socket that
    // connects (or reconnects) AFTER the shift started is still used.
    const socketRef = useRef(socket);
    const onlineRef = useRef(false);
    useEffect(() => { socketRef.current = socket; }, [socket]);
    useEffect(() => { onlineRef.current = online; }, [online]);

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
        socketRef.current?.emit("agent:offline");
        try { await api.put("/delivery/online", { isOnline: false }); } catch { /* best effort */ }
        await disablePushNotifications().catch(() => {});
    }, [stopWatching]);

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
            const sock = socketRef.current;
            if (lastCoordsRef.current && sock?.connected) {
                sock.emit("agent:location", lastCoordsRef.current);
            }
        }, LOCATION_PING_MS);

        setOnline(true);

        if (announce) {
            socketRef.current?.emit("agent:online");
            try {
                await api.put("/delivery/online", { isOnline: true });
            } catch {
                // The server never recorded the shift, so don't pretend it
                // started - roll the switch back and say why.
                stopWatching();
                setOnline(false);
                setLocationError("Couldn't start your shift — check your connection and try again.");
                return;
            }
        }

        const pushResult = await enablePushNotifications();
        setPushWarning(pushResult.success ? "" : pushResult.message);
    }, [stopWatching]);

    const goOnline = useCallback(() => startShift({ announce: true }), [startShift]);

    // Hydrate shift status on mount/reconnect instead of always defaulting
    // to "off" - this is the actual fix for the toggle turning off after
    // a page refresh. GET /delivery/online returns the persisted value;
    // if the agent was already on shift (including through the socket's
    // reconnect grace period - see backend/src/socket/socket.js), resume
    // watching/pinging without re-announcing (the server already knows).
    // Restore the persisted shift on mount (works even before the socket is
    // up - it's a plain REST call), so a refresh no longer shows "Off shift".
    useEffect(() => {
        let cancelled = false;

        api.get("/delivery/online")
            .then(({ data }) => {
                if (!cancelled && data?.data?.isOnline && !watchingRef.current) {
                    startShift({ announce: false });
                }
            })
            .catch(() => { /* best effort - falls back to manual toggle */ });

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // A dropped socket no longer flips the switch off (that made the button
    // look broken whenever the connection blipped or was blocked). When the
    // socket (re)connects during a shift, just re-announce presence.
    useEffect(() => {
        if (connected && onlineRef.current) {
            socketRef.current?.emit("agent:online");
        }
    }, [connected]);

    useEffect(() => stopWatching, [stopWatching]);

    return { online, goOnline, goOffline, locationError, pushWarning };
}
