import { useEffect } from "react";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";

// Mounted once near the root (App.jsx) alongside the other always-on
// listeners (UpdateAvailableBanner, NetworkStatusNotice, InstallPrompt).
// Backend broadcasts "department:maintenance" to every connected socket
// (see socket.js#emitToAll and category.service.js#notifyMaintenanceChange)
// whenever an admin toggles a department - manually or via a scheduled
// window - so any shopper anywhere in the app gets a toast, not just
// whoever happens to be on that department's page right now.
//
// DepartmentPage.jsx listens for the same event separately to swap its
// own content in/out live if the shopper is looking at the affected
// department when it happens.
export default function DepartmentMaintenanceListener() {
    const { socket } = useSocket();
    const toast = useToast();

    useEffect(() => {
        if (!socket) return undefined;

        const handleMaintenanceChange = ({ name, status, message }) => {
            if (status === "entered") {
                toast?.info(
                    message ? `${name} is now under maintenance: ${message}` : `${name} is now under maintenance.`
                );
            } else if (status === "deactivated") {
                toast?.info(`${name} is no longer available.`);
            } else {
                toast?.success(`${name} is back and available again.`);
            }
        };

        socket.on("department:maintenance", handleMaintenanceChange);
        return () => socket.off("department:maintenance", handleMaintenanceChange);
    }, [socket, toast]);

    return null;
}
