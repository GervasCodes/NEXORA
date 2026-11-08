import { useEffect, useState } from "react";
import PulseBar from "./ui/PulseBar";
import { useSocket } from "../context/SocketContext";
import { useLanguage } from "../context/LanguageContext";

// How long the socket must stay in "reconnecting" before the bar appears, so a
// one-second blip on a flaky mobile connection never flashes anything.
const SHOW_AFTER_MS = 1500;

// A thin pulse at the top of the viewport while the live-updates socket is
// retrying. It never blocks anything; it only says "live updates are paused".
export default function SocketStatusBar() {
    const socket = useSocket();
    const language = useLanguage();
    const reconnecting = socket?.connectionState === "reconnecting";
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!reconnecting) {
            setShow(false);
            return undefined;
        }
        const timer = setTimeout(() => setShow(true), SHOW_AFTER_MS);
        return () => clearTimeout(timer);
    }, [reconnecting]);

    const t = language?.t || ((key) => key);
    return <PulseBar active={show} position="top" label={t("pulse.reconnecting")} />;
}
