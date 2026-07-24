import { useEffect, useState } from "react";
import api from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";

const statusStyles = {
    pending: "bg-line text-ash",
    processing: "bg-mango/20 text-mango-dark",
    shipped: "bg-teal/10 text-teal",
    delivered: "bg-teal text-white",
    cancelled: "bg-coral/10 text-coral"
};

export default function AdminOrders() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [releasing, setReleasing] = useState(null);
    const [releaseNotes, setReleaseNotes] = useState({});

    useEffect(() => {
        api.get("/admin/orders").then(({ data }) => setOrders(data.data)).finally(() => setLoading(false));
    }, []);

    // Phase 9D manual early release - bypasses the normal delivered +
    // escrow_hold_days timing gate for one order, but the backend still
    // refuses to release anything covered by an open dispute. See
    // docs/ESCROW_ANALYSIS.md section 3.4.
    const releaseEscrow = async (orderId) => {
        setReleasing(orderId);
        setReleaseNotes((notes) => ({ ...notes, [orderId]: "" }));
        try {
            const { data } = await api.put(`/admin/orders/${orderId}/release-escrow`);
            const { released, closedByDispute, frozen } = data.data;
            setReleaseNotes((notes) => ({
                ...notes,
                [orderId]: `Released ${released} item(s)${closedByDispute ? `, closed ${closedByDispute}` : ""}${frozen ? `, ${frozen} frozen by an open dispute` : ""}.`
            }));
        } catch (err) {
            setReleaseNotes((notes) => ({
                ...notes,
                [orderId]: err.response?.data?.message || "Couldn't release this order's held earnings."
            }));
        } finally {
            setReleasing(null);
        }
    };

    if (loading) return <p className="text-ash">Loading orders…</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-6">All orders</h1>

            {orders.length === 0 && <p className="text-ash text-sm">No orders yet.</p>}

            <ul className="divide-y divide-line border-y border-line">
                {orders.map((o) => (
                    <li key={o.id} className="py-3 flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="price text-sm font-medium">{o.order_number}</p>
                            <p className="text-xs text-ash truncate">{o.first_name} {o.last_name} · {o.email}</p>
                        </div>

                        <p className="text-xs text-ash">{formatDate(o.created_at)}</p>

                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusStyles[o.status] || "bg-line text-ash"}`}>
                            {o.status}
                        </span>

                        <span className="text-xs text-ash capitalize">{o.payment_status}</span>

                        <p className="price text-sm font-medium">{formatMoney(o.total_amount)}</p>

                        {o.status === "delivered" && (
                            <div className="w-full sm:w-auto text-right">
                                <button
                                    onClick={() => releaseEscrow(o.id)}
                                    disabled={releasing === o.id}
                                    className="text-xs font-medium text-teal hover:underline disabled:opacity-50"
                                >
                                    {releasing === o.id ? "Releasing…" : "Release held earnings"}
                                </button>
                                {releaseNotes[o.id] && (
                                    <p className="text-xs text-ash mt-1">{releaseNotes[o.id]}</p>
                                )}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
