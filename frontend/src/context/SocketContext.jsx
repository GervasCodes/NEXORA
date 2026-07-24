import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

const getSocketUrl = () => {
    if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1";
    return apiUrl.replace(/\/api\/v1\/?$/, "");
};


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

    const value = useMemo(
        () => ({ socket: socketRef.current, connected, connectionState }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [connected, connectionState]
    );

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
}

export const useSocket = () => useContext(SocketContext);
