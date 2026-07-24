import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";

const SEVERITY_STYLES = {
    high: "bg-coral/10 text-coral",
    medium: "bg-mango/10 text-mango-dark",
    low: "bg-line/50 text-ash"
};

export default function AdminFraud() {
    const [flags, setFlags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);

    const load = () => {
        api.get("/admin/fraud-flags")
            .then(({ data }) => setFlags(data.data))
            .catch(() => setError("Couldn't load fraud flags."))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const resolve = async (id, status) => {
        setBusyId(id);
        try {
            await api.put(`/admin/fraud-flags/${id}/resolve`, { status });
            setFlags((prev) => prev.filter((f) => f.id !== id));
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Fraud review</h1>
            <p className="text-ash text-sm mb-8">
                Rule-based flags on unusual orders and seller withdrawals - not machine learning, just
                explainable heuristics (first-order size, order velocity, withdrawal outliers) so every flag
                has a plain-English reason attached.
            </p>

            {loading && <p className="text-ash">Loading…</p>}
            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            {!loading && flags.length === 0 && (
                <p className="text-ash text-sm">No open flags right now.</p>
            )}

            <ul className="space-y-3">
                {flags.map((flag) => (
                    <li key={flag.id} className="border border-line rounded-lg p-4">
                        <div className="flex items-start justify-between gap-4 mb-2">
                            <div>
                                <span className={`inline-block text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded mb-1.5 ${SEVERITY_STYLES[flag.severity]}`}>
                                    {flag.severity}
                                </span>
                                <p className="text-sm font-medium">
                                    {flag.entity_type === "order" ? (
                                        <>Order {flag.order_number} <span className="text-ash font-normal">({formatMoney(flag.order_amount)})</span></>
                                    ) : (
                                        "Seller withdrawal"
                                    )}
                                </p>
                                <p className="text-xs text-ash">
                                    {flag.person_first_name} {flag.person_last_name} · {flag.person_email}
                                </p>
                            </div>
                            <p className="text-xs text-ash whitespace-nowrap">{formatDate(flag.created_at)}</p>
                        </div>

                        <p className="text-sm mb-3">{flag.reason}</p>

                        <div className="flex items-center gap-3">
                            {flag.entity_type === "order" && (
                                <Link to={`/admin/orders`} className="text-xs text-teal hover:underline">
                                    View orders →
                                </Link>
                            )}
                            <button
                                onClick={() => resolve(flag.id, "dismissed")}
                                disabled={busyId === flag.id}
                                className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors disabled:opacity-60"
                            >
                                Dismiss
                            </button>
                            <button
                                onClick={() => resolve(flag.id, "confirmed")}
                                disabled={busyId === flag.id}
                                className="text-xs bg-coral text-paper px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-60"
                            >
                                Confirm as fraud
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
