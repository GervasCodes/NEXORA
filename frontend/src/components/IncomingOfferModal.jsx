import { useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext";

export default function IncomingOfferModal() {
    const { socket } = useSocket();
    const [offer, setOffer] = useState(null);
    const [msLeft, setMsLeft] = useState(0);
    const tickRef = useRef(null);

    useEffect(() => {
        if (!socket) return;

        const handleOffer = (payload) => {
            setOffer(payload);
            setMsLeft(payload.expiresInMs);
        };

        socket.on("delivery:offer", handleOffer);

        return () => {
            socket.off("delivery:offer", handleOffer);
        };
    }, [socket]);

    useEffect(() => {
        if (!offer) return;

        clearInterval(tickRef.current);
        tickRef.current = setInterval(() => {
            setMsLeft((prev) => {
                if (prev <= 1000) {
                    clearInterval(tickRef.current);
                    setOffer(null);
                    return 0;
                }
                return prev - 1000;
            });
        }, 1000);

        return () => clearInterval(tickRef.current);
    }, [offer]);

    if (!offer) return null;

    const respond = (accept) => {
        socket.emit("delivery:offer:respond", { offerId: offer.offerId, accept });
        setOffer(null);
    };

    return (
        <div className="fixed inset-0 z-50 bg-abyss/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4">
            <div className="glass-strong rounded-xl max-w-sm w-full p-6">
                <p className="text-xs uppercase tracking-widest text-ash mb-1">New delivery nearby</p>
                <p className="font-display text-xl mb-1">{offer.orderNumber}</p>
                <p className="text-sm text-ink/80 mb-1">
                    {offer.shippingAddress}, {offer.shippingCity}
                </p>
                <p className="text-sm text-teal font-medium mb-4">{offer.distanceKm} km away</p>

                <div className="h-1.5 bg-line rounded-full overflow-hidden mb-4">
                    <div
                        className="h-full bg-mango transition-all duration-1000 ease-linear"
                        style={{ width: `${(msLeft / offer.expiresInMs) * 100}%` }}
                    />
                </div>

                <div className="flex gap-3">
                    <button onClick={() => respond(false)}
                        className="flex-1 border border-line py-2.5 rounded-md text-sm font-medium hover:border-coral hover:text-coral transition-colors">
                        Decline
                    </button>
                    <button onClick={() => respond(true)}
                        className="flex-1 bg-mango text-abyss py-2.5 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors">
                        Accept ({Math.ceil(msLeft / 1000)}s)
                    </button>
                </div>
            </div>
        </div>
    );
}
