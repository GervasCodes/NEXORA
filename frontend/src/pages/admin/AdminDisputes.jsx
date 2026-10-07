import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import PageMeta from "../../components/PageMeta";
import EmptyState from "../../components/ui/EmptyState";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../context/ToastContext";
import {
    BulkBar,
    SortButton,
    bulkSummary,
    runBulk,
    useRowSelection,
    useSortedRows
} from "../../components/admin/AdminTableTools";

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

// Accessors live outside the component so the sort memo keeps its identity.
const DISPUTE_SORTS = {
    filed: (d) => (d.created_at ? new Date(d.created_at).getTime() : null),
    refund: (d) => (d.refund_amount == null ? null : Number(d.refund_amount)),
    status: (d) => d.status
};

export default function AdminDisputes() {
    const [disputes, setDisputes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("");
    const [type, setType] = useState("");
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkNote, setBulkNote] = useState("");
    const [confirmingBulk, setConfirmingBulk] = useState(false);
    const toast = useToast();

    const selection = useRowSelection();
    // Oldest open case first is the server's default; keep that as the
    // starting sort so the screen opens in the same order it always did.
    const { sorted, sort, toggleSort } = useSortedRows(disputes, DISPUTE_SORTS, { key: "filed", dir: "asc" });

    const load = () => {
        setLoading(true);
        const params = {};
        if (status) params.status = status;
        if (type) params.type = type;
        api.get("/disputes/admin", { params })
            .then(({ data }) => {
                setDisputes(data.data);
                selection.clear();
            })
            .catch((err) => toast?.error(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(load, [status, type]); // eslint-disable-line react-hooks/exhaustive-deps

    // Only open cases can be moved to "under review", so only those can be ticked for the bulk action.
    const reviewableIds = useMemo(
        () => new Set(disputes.filter((d) => d.status === "open").map((d) => d.id)),
        [disputes]
    );
    const selectedReviewable = selection.selectedIds.filter((id) => reviewableIds.has(id));
    const visibleOpenIds = sorted.filter((d) => d.status === "open").map((d) => d.id);

    const runBulkReview = async () => {
        setBulkBusy(true);
        const result = await runBulk(selectedReviewable, (id) => api.put(`/disputes/admin/${id}/review`));
        setBulkBusy(false);
        setConfirmingBulk(false);
        setBulkNote(bulkSummary("Marked under review", result));
        load();
    };

    return (
        <div>
            <PageMeta title="Disputes" noIndex />
            <h1 className="font-display text-2xl mb-1">Disputes</h1>
            <p className="text-ash text-sm mb-6">Buyer-filed cases across every order, oldest open case first.</p>

            <div className="flex gap-2 mb-4 flex-wrap">
                <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    aria-label="Filter by status"
                    className="border border-line rounded-md px-3 py-1.5 text-sm bg-paper"
                >
                    {STATUS_FILTERS.map((s) => (
                        <option key={s} value={s}>{s ? s.replace("_", " ") : "All statuses"}</option>
                    ))}
                </select>
                <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    aria-label="Filter by type"
                    className="border border-line rounded-md px-3 py-1.5 text-sm bg-paper"
                >
                    <option value="">All types</option>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
            </div>

            {disputes.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-ash">
                    <span>Sort:</span>
                    <SortButton label="Filed" sortKey="filed" sort={sort} onSort={toggleSort} />
                    <SortButton label="Refund" sortKey="refund" sort={sort} onSort={toggleSort} />
                    <SortButton label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                    {visibleOpenIds.length > 0 && (
                        <button
                            type="button"
                            onClick={() => selection.toggleAll(visibleOpenIds)}
                            className="ml-auto text-teal hover:underline"
                        >
                            {visibleOpenIds.every((id) => selection.selectedIds.includes(id)) ? "Unselect open cases" : "Select all open cases"}
                        </button>
                    )}
                </div>
            )}

            {bulkNote && <p role="status" className="text-xs text-ash mb-3">{bulkNote}</p>}

            <BulkBar count={selectedReviewable.length} onClear={selection.clear}>
                <button
                    type="button"
                    onClick={() => setConfirmingBulk(true)}
                    disabled={bulkBusy}
                    className="text-xs bg-azure text-paper px-3 py-1.5 rounded-md disabled:opacity-50"
                >
                    Mark selected under review
                </button>
            </BulkBar>

            {loading ? (
                <p className="text-ash">Loading disputes…</p>
            ) : disputes.length === 0 ? (
                <EmptyState title="No disputes match this filter." />
            ) : (
                <ul className="space-y-3">
                    {sorted.map((d) => {
                        const canSelect = reviewableIds.has(d.id);
                        return (
                            <li key={d.id} className="flex items-start gap-3">
                                {canSelect ? (
                                    <input
                                        type="checkbox"
                                        className="mt-5"
                                        checked={selection.selectedIds.includes(d.id)}
                                        onChange={() => selection.toggle(d.id)}
                                        aria-label={`Select dispute ${d.dispute_number}`}
                                    />
                                ) : (
                                    <span className="w-4 shrink-0" aria-hidden="true" />
                                )}
                                <Link
                                    to={`/disputes/${d.id}`}
                                    className="block flex-1 min-w-0 border border-line rounded-lg p-4 hover:border-abyss transition-colors"
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
                        );
                    })}
                </ul>
            )}

            <ConfirmDialog
                open={confirmingBulk}
                title={`Mark ${selectedReviewable.length} dispute${selectedReviewable.length === 1 ? "" : "s"} under review?`}
                description="The buyer and seller are notified that the case is being looked at. You still resolve or reject each one on its own page."
                confirmLabel="Mark under review"
                onConfirm={runBulkReview}
                onCancel={() => setConfirmingBulk(false)}
            />
        </div>
    );
}
