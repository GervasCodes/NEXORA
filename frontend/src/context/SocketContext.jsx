import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

const getSocketUrl = () => {
    if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1";
    return apiUrl.replace(/\/api\/v1\/?$/, "");
};

// "connected"    - live, everything works
// "connecting"   - first-ever connection attempt hasn't completed yet
// "reconnecting" - was connected, dropped, socket.io is retrying
// "disconnected" - not authenticated, or the socket was closed on purpose
export function SocketProvider({ children }) {
    const { user } = useAuth();
    const socketRef = useRef(null);
    const [connected, setConnected] = useState(false);
    const [connectionState, setConnectionState] = useState("disconnected");

    useEffect(() => {
        const token = localStorage.getItem("nexora_token");

        if (!user || !token) {
            socketRef.current?.disconnect();
            socketRef.current = null;
            setConnected(false);
            setConnectionState("disconnected");
            return;
        }

        const socket = io(getSocketUrl(), {
            auth: { token },
            transports: ["websocket", "polling"],
            // Retry indefinitely with capped exponential backoff, rather
            // than relying on socket.io's defaults implicitly - a
            // delivery can run for 30+ minutes, during which an agent's
            // or buyer's connection may drop repeatedly (elevators,
            // patchy mobile data, a phone sleeping); giving up after a
            // handful of tries would silently strand the tracking UI.
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 10000,
            randomizationFactor: 0.5
        });

        setConnectionState("connecting");

        socket.on("connect", () => {
            setConnected(true);
            setConnectionState("connected");
        });

        socket.on("disconnect", (reason) => {
            setConnected(false);
            // "io client disconnect" means *we* called .disconnect() (e.g.
            // logging out) - socket.io won't auto-retry that on its own,
            // so it's a true "disconnected", not a drop to recover from.
            setConnectionState(reason === "io client disconnect" ? "disconnected" : "reconnecting");
        });

        socket.on("reconnect_attempt", () => setConnectionState("reconnecting"));
        socket.on("connect_error", () => {
            setConnected(false);
            setConnectionState((prev) => (prev === "connected" ? "reconnecting" : "connecting"));
        });

        socketRef.current = socket;

        return () => {
            socket.disconnect();
        };
    }, [user]);

    return (
        <SocketContext.Provider value={{ socket: socketRef.current, connected, connectionState }}>
            {children}
        </SocketContext.Provider>
    );
}

export const useSocket = () => useContext(SocketContext);
