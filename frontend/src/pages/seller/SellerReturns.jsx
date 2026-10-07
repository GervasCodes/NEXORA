import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import PageMeta from "../../components/PageMeta";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";

const REASON_LABELS = {
    damaged_item: "Item arrived damaged",
    wrong_item: "Wrong item received",
    defective_product: "Product is defective",
    not_as_described: "Not as described",
    changed_mind: "Changed mind",
    other: "Other"
};

export default function SellerReturns() {
    const [returns, setReturns] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/returns/seller").then(({ data }) => setReturns(data.data)).finally(() => setLoading(false));
    }, []);

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title="Returns" noIndex />
            <h1 className="font-display text-2xl mb-1">Returns</h1>
            <p className="text-ash text-sm mb-8">Return requests buyers have filed on your orders.</p>

            {returns.length === 0 ? (
                <EmptyState title="No return requests yet." />
            ) : (
                <ul className="space-y-3">
                    {returns.map((r) => (
                        <li key={r.id}>
                            <Link
                                to={`/returns/${r.id}`}
                                className="block border border-line rounded-lg p-4 hover:border-abyss transition-colors"
                            >
                                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                                    <p className="text-xs text-ash">Order {r.order_number}</p>
                                    <StatusBadge domain="return" status={r.status} />
                                </div>
                                <p className="text-sm font-medium mb-1">{REASON_LABELS[r.reason] || r.reason}</p>
                                {r.refund_amount && (
                                    <p className="text-xs text-coral">Refund: {formatMoney(r.refund_amount)}</p>
                                )}
                                <p className="text-xs text-ash mt-1">Filed {formatDate(r.created_at)}</p>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
