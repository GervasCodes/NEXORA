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
    const { user, sessionReady } = useAuth();
    const socketRef = useRef(null);
    const [connected, setConnected] = useState(false);
    const [connectionState, setConnectionState] = useState("disconnected");

    useEffect(() => {
        // Testing & Session Hardening no more reading a token
        // out of localStorage - the session lives in an httpOnly cookie
        // now (see AuthContext.jsx / api/client.js). `user` alone gates
        // whether to connect; the cookie itself authenticates the
        // handshake, sent automatically by the browser when
        // withCredentials is true and the server's CORS config allows
        // credentials for this origin (both already true - see
        // socket.js).
        //
        // `sessionReady` additionally guards against connecting on the
        // optimistic, not-yet-confirmed `user` value from localStorage
        // (see AuthContext.jsx) - without it, a stale cached session
        // opens a handshake with a cookie the server has already
        // invalidated, which fails immediately and shows up as a
        // "WebSocket is closed before the connection is established"
        // console error right alongside the notification bells' 401s.
        if (!user || !sessionReady) {
            socketRef.current?.disconnect();
            socketRef.current = null;
            setConnected(false);
            setConnectionState("disconnected");
            return;
        }

        const socket = io(getSocketUrl(), {
            withCredentials: true,
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
    }, [user, sessionReady]);

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
