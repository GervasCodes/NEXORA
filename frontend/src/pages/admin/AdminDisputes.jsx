import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";

const STATUS_STYLES = {
    open: "bg-mango/20 text-mango-dark",
    under_review: "bg-azure/10 text-azure",
    resolved: "bg-teal text-white",
    rejected: "bg-coral/10 text-coral",
    withdrawn: "bg-line text-ash"
};

const TYPE_LABELS = {
    damaged_item: "Damaged item",
    delayed_delivery: "Delayed delivery",
    defective_product: "Defective product",
    wrong_item: "Wrong item",
    missing_delivery: "Missing delivery",
    other: "Other issue"
};

const STATUS_FILTERS = ["", "open", "under_review", "resolved", "rejected", "withdrawn"];

export default function AdminDisputes() {
    const [disputes, setDisputes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("");
    const [type, setType] = useState("");

    const load = () => {
        setLoading(true);
        const params = {};
        if (status) params.status = status;
        if (type) params.type = type;
        api.get("/disputes/admin", { params }).then(({ data }) => setDisputes(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, [status, type]);

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Disputes</h1>
            <p className="text-ash text-sm mb-6">Buyer-filed cases across every order, oldest open case first.</p>

            <div className="flex gap-2 mb-6 flex-wrap">
                <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="border border-line rounded-md px-3 py-1.5 text-sm bg-paper"
                >
                    {STATUS_FILTERS.map((s) => (
                        <option key={s} value={s}>{s ? s.replace("_", " ") : "All statuses"}</option>
                    ))}
                </select>
                <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="border border-line rounded-md px-3 py-1.5 text-sm bg-paper"
                >
                    <option value="">All types</option>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
            </div>

            {loading ? (
                <p className="text-ash">Loading disputes…</p>
            ) : disputes.length === 0 ? (
                <p className="text-ash text-sm">No disputes match this filter.</p>
            ) : (
                <ul className="space-y-3">
                    {disputes.map((d) => (
                        <li key={d.id}>
                            <Link
                                to={`/disputes/${d.id}`}
                                className="block border border-line rounded-lg p-4 hover:border-abyss transition-colors"
                            >
                                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                                    <div>
                                        <p className="price text-sm font-medium">{d.dispute_number}</p>
                                        <p className="text-xs text-ash">Order {d.order_number}</p>
                                    </div>
                                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${STATUS_STYLES[d.status] || "bg-line text-ash"}`}>
                                        {d.status.replace("_", " ")}
                                    </span>
                                </div>
                                <p className="text-sm font-medium mb-1">{d.subject}</p>
                                <p className="text-xs text-ash mb-1">{TYPE_LABELS[d.type] || d.type}</p>
                                <p className="text-xs text-ash mb-1">
                                    Buyer: {d.buyer_first_name} {d.buyer_last_name}
                                    {d.seller_first_name && ` · Seller: ${d.seller_first_name} ${d.seller_last_name}`}
                                </p>
                                {d.refund_amount && (
                                    <p className="text-xs text-coral">Refund: {formatMoney(d.refund_amount)}</p>
                                )}
                                <p className="text-xs text-ash mt-1">Filed {formatDate(d.created_at)}</p>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
