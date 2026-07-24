import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";

const STATUS_STYLES = {
    pending: "bg-mango/20 text-mango-dark",
    approved: "bg-teal/10 text-teal",
    paid: "bg-teal text-white",
    rejected: "bg-coral/10 text-coral"
};

export default function AdminWithdrawals() {
    const [withdrawals, setWithdrawals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [notes, setNotes] = useState({});
    const [error, setError] = useState("");

    const load = () => {
        api.get("/admin/withdrawals").then(({ data }) => setWithdrawals(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const act = async (id, action) => {
        setBusyId(id);
        setError("");
        try {
            await api.put(`/admin/withdrawals/${id}/${action}`, { admin_note: notes[id] || undefined });
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <p className="text-ash">Loading withdrawal requests…</p>;

    if (withdrawals.length === 0) {
        return <p className="text-ash text-sm">No withdrawal requests yet.</p>;
    }

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Withdrawal requests</h1>
            <p className="text-ash text-sm mb-8">Seller payout requests from their wallet balance.</p>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            <ul className="space-y-4">
                {withdrawals.map((w) => (
                    <li key={w.id} className="border border-line rounded-lg p-4">
                        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                            <div>
                                <p className="font-medium text-sm">{w.store_name || `${w.first_name} ${w.last_name}`}</p>
                                <p className="text-xs text-ash">{w.email}</p>
                            </div>
                            <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${STATUS_STYLES[w.status] || "bg-line text-ash"}`}>
                                {w.status}
                            </span>
                        </div>

                        <p className="price text-lg font-medium mb-1">{formatMoney(w.amount)}</p>
                        <p className="text-sm text-ink/80 mb-1">
                            {w.payout_method === "mobile_money" ? "Mobile money" : "Bank transfer"} · {w.payout_details}
                        </p>
                        <p className="text-xs text-ash mb-3">Requested {formatDate(w.requested_at)}</p>
                        {w.admin_note && <p className="text-xs text-ash mb-3">Note: {w.admin_note}</p>}

                        {w.status === "pending" && (
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    placeholder="Optional note"
                                    value={notes[w.id] || ""}
                                    onChange={(e) => setNotes((n) => ({ ...n, [w.id]: e.target.value }))}
                                    className="w-full border border-line rounded-md px-3 py-1.5 text-sm"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => act(w.id, "approve")}
                                        disabled={busyId === w.id}
                                        className="text-xs bg-teal text-white px-3 py-1.5 rounded-md hover:bg-teal/90 transition-colors disabled:opacity-50"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => act(w.id, "reject")}
                                        disabled={busyId === w.id}
                                        className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-coral hover:text-coral transition-colors disabled:opacity-50"
                                    >
                                        Reject &amp; refund
                                    </button>
                                </div>
                            </div>
                        )}

                        {w.status === "approved" && (
                            <button
                                onClick={() => act(w.id, "paid")}
                                disabled={busyId === w.id}
                                className="text-xs bg-ink text-paper px-3 py-1.5 rounded-md disabled:opacity-50"
                            >
                                Mark as paid
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
