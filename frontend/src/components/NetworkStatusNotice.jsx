import { useEffect, useRef } from "react";
import { useToast } from "../context/ToastContext.jsx";

// Resilience & Growth. Renders nothing itself - just wires
// window "online"/"offline" events to the existing toast system so a
// buyer mid-checkout (or a seller mid-upload) gets an explicit signal
// instead of silently-failing requests with no explanation. Deliberately
// does NOT fire a toast on first mount even if already offline - that
// would surprise everyone who opens the app with a slow-but-present
// connection right as this effect runs; it only reacts to a genuine
// transition after mount.
export default function NetworkStatusNotice() {
    const toast = useToast();
    const hasMounted = useRef(false);

    useEffect(() => {
        hasMounted.current = true;

        const handleOffline = () => {
            if (!hasMounted.current) return;
            toast?.error("You're offline. Some features may be unavailable until your connection returns.", 6000);
        };
        const handleOnline = () => {
            if (!hasMounted.current) return;
            toast?.success("Back online.", 3000);
        };

        window.addEventListener("offline", handleOffline);
        window.addEventListener("online", handleOnline);
        return () => {
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("online", handleOnline);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null;
}
