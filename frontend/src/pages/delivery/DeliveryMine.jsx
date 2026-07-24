import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";

const NEXT_STATUS = {
    assigned: [{ value: "picked_up", label: "Mark picked up" }, { value: "failed", label: "Report failed" }],
    picked_up: [{ value: "in_transit", label: "Mark in transit" }, { value: "failed", label: "Report failed" }],
    in_transit: [{ value: "delivered", label: "Mark delivered" }, { value: "failed", label: "Report failed" }]
};

const statusStyles = {
    assigned: "bg-line text-ash",
    picked_up: "bg-mango/20 text-mango-dark",
    in_transit: "bg-teal/10 text-teal",
    delivered: "bg-teal text-white",
    failed: "bg-coral/10 text-coral"
};

export default function DeliveryMine() {
    const [deliveries, setDeliveries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState("");

    const load = () => {
        api.get("/delivery/my/list").then(({ data }) => setDeliveries(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const updateStatus = async (orderId, status) => {
        setBusyId(orderId);
        setError("");
        try {
            await api.put(`/delivery/${orderId}/status`, { status });
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <p className="text-ash">Loading your deliveries…</p>;

    if (deliveries.length === 0) {
        return <p className="text-ash text-sm">You haven't claimed any deliveries yet.</p>;
    }

    return (
        <div>
            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            <ul className="space-y-4">
                {deliveries.map((d) => (
                    <li key={d.id} className="border border-line rounded-lg p-4">
                        <div className="flex items-center justify-between gap-3 mb-2">
                            <p className="price text-sm font-medium">{d.order_number}</p>
                            <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${statusStyles[d.status] || "bg-line text-ash"}`}>
                                {d.status.replace("_", " ")}
                            </span>
                        </div>

                        <p className="text-sm text-ink/80 mb-1">
                            {d.shipping_address}, {d.shipping_city}, {d.shipping_region}
                        </p>
                        <p className="text-xs text-ash mb-3">Contact: {d.shipping_phone}</p>

                        <div className="flex gap-2">
                            {(NEXT_STATUS[d.status] || []).map((next) => (
                                <button
                                    key={next.value}
                                    onClick={() => updateStatus(d.order_id, next.value)}
                                    disabled={busyId === d.order_id}
                                    className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors disabled:opacity-50"
                                >
                                    {next.label}
                                </button>
                            ))}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
