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

export default function SellerDisputes() {
    const [disputes, setDisputes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/disputes/seller").then(({ data }) => setDisputes(data.data)).finally(() => setLoading(false));
    }, []);

    if (loading) return <p className="text-ash">Loading disputes…</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Disputes</h1>
            <p className="text-ash text-sm mb-8">Issues buyers have raised on your orders.</p>

            {disputes.length === 0 ? (
                <p className="text-ash text-sm">No disputes have been filed against your orders.</p>
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
