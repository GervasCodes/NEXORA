import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { formatDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";

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

export default function Disputes() {
    const { format } = useCurrency();
    const [disputes, setDisputes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/disputes").then(({ data }) => setDisputes(data.data)).finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="max-w-2xl mx-auto px-6 py-16 text-ash">Loading your disputes…</div>;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <div className="flex items-baseline justify-between mb-1">
                <h1 className="font-display text-2xl">My disputes</h1>
            </div>
            <p className="text-ash text-sm mb-8">
                Report a problem with any order from its order page, and track the outcome here.
            </p>

            {disputes.length === 0 ? (
                <div className="border border-line rounded-lg p-8 text-center">
                    <p className="text-ash text-sm mb-3">You haven't filed any disputes.</p>
                    <Link to="/orders" className="text-teal hover:underline text-sm">Go to your orders</Link>
                </div>
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
                                    <p className="text-xs text-teal">Refund approved: {format(d.refund_amount)}</p>
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
