import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useSocket } from "../context/SocketContext";
import { enablePushNotifications, disablePushNotifications } from "../utils/push";

const LOCATION_PING_MS = 8000;

// Drives the "on shift" toggle for a delivery agent: watches the device's
// GPS and pings the position to the server every LOCATION_PING_MS while
// online, and flips the server-side is_online flag on start/stop.
export function useAgentShift() {
    const { socket, connected } = useSocket();
    const [online, setOnline] = useState(false);
    const [locationError, setLocationError] = useState("");
    const [pushWarning, setPushWarning] = useState("");
    const watchIdRef = useRef(null);
    const intervalRef = useRef(null);
    const lastCoordsRef = useRef(null);

    const stopWatching = useCallback(() => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const goOffline = useCallback(async () => {
        stopWatching();
        setOnline(false);
        setPushWarning("");
        socket?.emit("agent:offline");
        try { await api.put("/delivery/online", { isOnline: false }); } catch { /* best effort */ }
        await disablePushNotifications().catch(() => {});
    }, [socket, stopWatching]);

    const goOnline = useCallback(async () => {
        if (!navigator.geolocation) {
            setLocationError("This device/browser doesn't support location sharing.");
            return;
        }
        setLocationError("");

        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                lastCoordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            },
            () => setLocationError("Couldn't read your location — check location permissions."),
            { enableHighAccuracy: true, maximumAge: 5000 }
        );

        // Throttle actual socket emits rather than firing on every GPS tick
        intervalRef.current = setInterval(() => {
            if (lastCoordsRef.current && socket?.connected) {
                socket.emit("agent:location", lastCoordsRef.current);
            }
        }, LOCATION_PING_MS);

        setOnline(true);
        socket?.emit("agent:online");
        try { await api.put("/delivery/online", { isOnline: true }); } catch { /* best effort */ }

        // Push is a "nice to have" layer on top of the socket offer — never
        // let a permission dialog or missing VAPID config block the shift
        // from starting.
        const pushResult = await enablePushNotifications();
        setPushWarning(pushResult.success ? "" : pushResult.message);
    }, [socket]);

    // If the socket drops while online, the server already marks us offline
    // (see socket.js disconnect handler) — mirror that in the UI.
    useEffect(() => {
        if (!connected && online) {
            stopWatching();
            setOnline(false);
        }
    }, [connected, online, stopWatching]);

    useEffect(() => stopWatching, [stopWatching]);

    return { online, goOnline, goOffline, locationError, pushWarning };
}
