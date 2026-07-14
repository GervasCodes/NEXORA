import { createContext, useContext, useEffect, useRef, useState } from "react";
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

    useEffect(() => {
        const token = localStorage.getItem("nexora_token");

        if (!user || !token) {
            socketRef.current?.disconnect();
            socketRef.current = null;
            setConnected(false);
            return;
        }

        const socket = io(getSocketUrl(), {
            auth: { token },
            transports: ["websocket", "polling"]
        });

        socket.on("connect", () => setConnected(true));
        socket.on("disconnect", () => setConnected(false));

        socketRef.current = socket;

        return () => {
            socket.disconnect();
        };
    }, [user]);

    return (
        <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
            {children}
        </SocketContext.Provider>
    );
}

export const useSocket = () => useContext(SocketContext);
