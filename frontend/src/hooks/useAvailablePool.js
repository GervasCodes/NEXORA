import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useSocket } from "../context/SocketContext";

// The shared "available for pickup" pool, kept fresh by socket events
// (delivery:pool_updated / delivery:offer) instead of a timer. It also
// refetches when the socket (re)connects and when the tab becomes visible
// again, which covers anything missed while offline.
export default function useAvailablePool(enabled = true) {
    const { socket, connected } = useSocket();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    // True while the pool is refetched with a list already on screen (socket event,
    // reconnect, tab visible) - drives a PulseBar instead of a skeleton.
    const [refreshing, setRefreshing] = useState(false);
    const hasLoaded = useRef(false);
    const inFlight = useRef(false);
    const queued = useRef(false);

    const reload = useCallback(() => {
        if (inFlight.current) {
            queued.current = true;
            return Promise.resolve();
        }
        inFlight.current = true;
        if (hasLoaded.current) setRefreshing(true);
        return api
            .get("/delivery/available")
            .then(({ data }) => {
                setOrders(data.data);
                setError(false);
            })
            .catch(() => setError(true))
            .finally(() => {
                inFlight.current = false;
                hasLoaded.current = true;
                setLoading(false);
                setRefreshing(false);
                if (queued.current) {
                    queued.current = false;
                    reload();
                }
            });
    }, []);

    useEffect(() => {
        if (enabled) reload();
    }, [reload, connected, enabled]);

    useEffect(() => {
        if (!enabled || !socket) return undefined;
        const onChange = () => reload();
        socket.on("delivery:pool_updated", onChange);
        socket.on("delivery:offer", onChange);
        return () => {
            socket.off("delivery:pool_updated", onChange);
            socket.off("delivery:offer", onChange);
        };
    }, [socket, reload, enabled]);

    useEffect(() => {
        if (!enabled) return undefined;
        const onVisible = () => {
            if (document.visibilityState === "visible") reload();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [reload, enabled]);

    return { orders, loading, refreshing, error, reload };
}
