import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import PageMeta from "../../components/PageMeta";
import { useToast } from "../../context/ToastContext";
import EmptyState from "../../components/ui/EmptyState";
import ConfirmDialog from "../../components/ConfirmDialog";
import { BulkBar, bulkSummary, runBulk, useRowSelection } from "../../components/admin/AdminTableTools";

const PAGE_SIZE = 25;
const TABS = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "paid", label: "Paid" },
    { key: "rejected", label: "Rejected" },
    { key: "all", label: "All" }
];

// Server-side sort options. "queue" is the default (oldest pending first).
const SORT_OPTIONS = [
    { value: "queue", label: "Queue order" },
    { value: "amount_desc", label: "Amount: high to low" },
    { value: "amount_asc", label: "Amount: low to high" },
    { value: "requested_desc", label: "Newest requests first" },
    { value: "requested_asc", label: "Oldest requests first" }
];

const BULK_LABELS = {
    approve: { verb: "Approve", past: "Approved", danger: false, confirm: "Approve all", tab: "pending" },
    reject: { verb: "Reject & refund", past: "Rejected", danger: true, confirm: "Reject & refund all", tab: "pending" },
    paid: { verb: "Mark as paid", past: "Marked as paid", danger: false, confirm: "Mark all as paid", tab: "approved" }
};

const STATUS_STYLES = {
    pending: "bg-mango/20 text-mango-dark",
    approved: "bg-teal/10 text-teal",
    paid: "bg-teal text-white",
    rejected: "bg-coral/10 text-coral"
};

export default function AdminWithdrawals() {
    const [withdrawals, setWithdrawals] = useState([]);
    const [meta, setMeta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("pending");
    const [page, setPage] = useState(1);
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [notes, setNotes] = useState({});
    // Full payout details, fetched one at a time through the audited reveal
    // endpoint. The list itself only ever holds masked values.
    const [revealed, setRevealed] = useState({});
    // Decision context per withdrawal (wallet, earnings, history, tier,
    // disputes). Fetched on demand so the list stays one query per page.
    const [contexts, setContexts] = useState({});
    const [contextOpen, setContextOpen] = useState({});
    const [pending, setPending] = useState(null); // { w, action }
    const [sortKey, setSortKey] = useState("queue");
    const [bulkAction, setBulkAction] = useState(null); // "approve" | "reject" | "paid"
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkNote, setBulkNote] = useState("");
    const selection = useRowSelection();
    const toast = useToast();

    // Server-side paging. Pending is oldest-first (the queue order); the
    // backend sets that. Tab counts and totals come back in meta.totals.
    const load = (nextTab = tab, nextPage = page, nextSearch = search, nextSort = sortKey) => {
        setLoading(true);
        const params = { page: nextPage, pageSize: PAGE_SIZE };
        if (nextTab !== "all") params.status = nextTab;
        if (nextSearch) params.q = nextSearch;
        if (nextSort && nextSort !== "queue") params.sort = nextSort;
        api.get("/admin/withdrawals", { params })
            .then(({ data }) => {
                setWithdrawals(data.data);
                setMeta(data.meta);
                selection.clear();
            })
            .catch((err) => toast?.error(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const changeTab = (key) => {
        setTab(key);
        setPage(1);
        selection.clear();
        setBulkNote("");
        load(key, 1, search);
    };

    const changeSort = (value) => {
        setSortKey(value);
        setPage(1);
        load(tab, 1, search, value);
    };

    // Only rows whose status matches the bulk action can be acted on, so a
    // mixed selection (e.g. pending + paid) still runs cleanly.
    const selectableFor = (action) => {
        const wanted = BULK_LABELS[action].tab;
        return withdrawals.filter((w) => w.status === wanted).map((w) => w.id);
    };

    const runBulkWithdrawal = async () => {
        const action = bulkAction;
        const allowed = new Set(selectableFor(action));
        const ids = selection.selectedIds.filter((id) => allowed.has(id));
        setBulkBusy(true);
        const result = await runBulk(ids, (id) =>
            api.put(`/admin/withdrawals/${id}/${action}`, { admin_note: notes[id] || undefined })
        );
        setBulkBusy(false);
        setBulkAction(null);
        setBulkNote(bulkSummary(BULK_LABELS[action].past, result));
        load(tab, page, search, sortKey);
    };

    const submitSearch = (e) => {
        e.preventDefault();
        const term = searchInput.trim();
        setSearch(term);
        setPage(1);
        load(tab, 1, term);
    };

    const changePage = (next) => {
        setPage(next);
        selection.clear();
        load(tab, next, search, sortKey);
    };

    const totalFor = (key) => {
        if (!meta?.totals) return null;
        if (key === "all") return meta.totals.reduce((n, t) => n + t.count, 0);
        return meta.totals.find((t) => t.status === key)?.count ?? 0;
    };

    const reveal = async (id) => {
        setBusyId(id);
        try {
            const { data } = await api.get(`/admin/withdrawals/${id}/payout-details`);
            setRevealed((r) => ({ ...r, [id]: data.data.payout_details }));
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const toggleContext = async (id) => {
        const opening = !contextOpen[id];
        setContextOpen((c) => ({ ...c, [id]: opening }));
        if (!opening || contexts[id]) return;
        try {
            const { data } = await api.get(`/admin/withdrawals/${id}/context`);
            setContexts((c) => ({ ...c, [id]: data.data }));
        } catch (err) {
            toast?.error(extractErrorMessage(err));
            setContextOpen((c) => ({ ...c, [id]: false }));
        }
    };

    const act = async (id, action) => {
        setPending(null);
        setBusyId(id);
        try {
            await api.put(`/admin/withdrawals/${id}/${action}`, { admin_note: notes[id] || undefined });
            load(tab, page, search, sortKey);
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading && !meta) return <PageLoader />;

    return (
        <div>
            <PageMeta title="Withdrawals" noIndex />
            <h1 className="font-display text-2xl mb-1">Withdrawal requests</h1>
            <p className="text-ash text-sm mb-6">Seller payout requests from their wallet balance.</p>

            <div role="tablist" aria-label="Withdrawal status" className="flex gap-2 flex-wrap mb-4">
                {TABS.map((t) => {
                    const count = totalFor(t.key);
                    const active = tab === t.key;
                    return (
                        <button
                            key={t.key}
                            role="tab"
                            aria-selected={active}
                            type="button"
                            onClick={() => changeTab(t.key)}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                                active ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"
                            }`}
                        >
                            {t.label}{count !== null ? ` (${count})` : ""}
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
                <label className="text-xs text-ash flex items-center gap-2">
                    Sort
                    <select
                        value={sortKey}
                        onChange={(e) => changeSort(e.target.value)}
                        aria-label="Sort withdrawals"
                        className="border border-line rounded-md px-2 py-1.5 text-xs bg-paper"
                    >
                        {SORT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </label>
                {bulkNote && <p role="status" className="text-xs text-ash ml-auto">{bulkNote}</p>}
            </div>

            <BulkBar count={selection.selectedIds.length} onClear={selection.clear}>
                {["approve", "reject", "paid"].map((action) => {
                    const n = selectableFor(action).filter((id) => selection.selectedIds.includes(id)).length;
                    if (n === 0) return null;
                    return (
                        <button
                            key={action}
                            type="button"
                            onClick={() => setBulkAction(action)}
                            disabled={bulkBusy}
                            className={`text-xs px-3 py-1.5 rounded-md disabled:opacity-50 ${
                                BULK_LABELS[action].danger
                                    ? "border border-coral text-coral hover:bg-coral/10"
                                    : action === "paid" ? "bg-ink text-paper" : "bg-teal text-white"
                            }`}
                        >
                            {BULK_LABELS[action].verb} ({n})
                        </button>
                    );
                })}
            </BulkBar>

            <form onSubmit={submitSearch} className="flex gap-2 mb-6">
                <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search store, seller email, payout reference or ID"
                    aria-label="Search withdrawals"
                    className="flex-1 border border-line rounded-md px-3 py-1.5 text-sm"
                />
                <button type="submit" className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink">
                    Search
                </button>
            </form>

            {loading && <p className="text-xs text-ash mb-4">Loading…</p>}

            {!loading && withdrawals.length === 0 && (
                <EmptyState title={search ? "No withdrawals match that search." : "No withdrawal requests here."} />
            )}

            <ul className="space-y-4">
                {withdrawals.map((w) => (
                    <li key={w.id} className="border border-line rounded-lg p-4">
                        {(w.status === "pending" || w.status === "approved") && (
                            <label className="flex items-center gap-2 text-xs text-ash mb-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selection.selectedIds.includes(w.id)}
                                    onChange={() => selection.toggle(w.id)}
                                    aria-label={`Select withdrawal #${w.id}`}
                                />
                                Select
                            </label>
                        )}
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
                            {w.payout_method === "mobile_money" ? "Mobile money" : "Bank transfer"} · {revealed[w.id] ?? w.payout_details}
                            {revealed[w.id] === undefined && (
                                <button
                                    type="button"
                                    onClick={() => reveal(w.id)}
                                    disabled={busyId === w.id}
                                    className="ml-2 text-xs text-teal hover:underline disabled:opacity-50"
                                >
                                    Reveal (logged)
                                </button>
                            )}
                        </p>
                        {w.payout_currency === "USD" && w.payout_amount && (
                            <p className="text-sm text-ink/80 mb-1">
                                Seller expects ~${w.payout_amount} USD (rate {w.payout_exchange_rate} at request time)
                            </p>
                        )}
                        <p className="text-xs text-ash mb-3">Requested {formatDate(w.requested_at)}</p>

                        <button
                            type="button"
                            onClick={() => toggleContext(w.id)}
                            aria-expanded={!!contextOpen[w.id]}
                            className="text-xs text-teal hover:underline mb-3"
                        >
                            {contextOpen[w.id] ? "Hide decision context" : "Show decision context"}
                        </button>
                        {contextOpen[w.id] && (
                            <div className="text-xs text-ink/80 bg-line/30 rounded-md p-3 mb-3 space-y-1">
                                {!contexts[w.id] ? (
                                    <p className="text-ash">Loading context…</p>
                                ) : (
                                    <>
                                        <p>Wallet balance now: {formatMoney(contexts[w.id].wallet_balance)}</p>
                                        <p>Total earned from orders: {formatMoney(contexts[w.id].total_earned)}</p>
                                        <p>Verification tier: <span className="capitalize">{String(contexts[w.id].verification_tier).replace(/_/g, " ")}</span></p>
                                        <p>Open disputes against this seller: {contexts[w.id].open_disputes}</p>
                                        <p>
                                            Previous withdrawals:{" "}
                                            {contexts[w.id].previous_withdrawals.length === 0
                                                ? "none"
                                                : contexts[w.id].previous_withdrawals
                                                    .map((r) => `${r.count} ${r.status} (${formatMoney(r.amount)})`)
                                                    .join(", ")}
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
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
                                        onClick={() => setPending({ w, action: "approve" })}
                                        disabled={busyId === w.id}
                                        className="text-xs bg-teal text-white px-3 py-1.5 rounded-md hover:bg-teal/90 transition-colors disabled:opacity-50"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => setPending({ w, action: "reject" })}
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
                                onClick={() => setPending({ w, action: "paid" })}
                                disabled={busyId === w.id}
                                className="text-xs bg-ink text-paper px-3 py-1.5 rounded-md disabled:opacity-50"
                            >
                                Mark as paid
                            </button>
                        )}
                    </li>
                ))}
            </ul>

            {meta && meta.totalPages > 1 && (
                <nav aria-label="Withdrawal pages" className="flex items-center justify-between mt-6 text-sm">
                    <button
                        type="button"
                        onClick={() => changePage(page - 1)}
                        disabled={page <= 1 || loading}
                        className="text-xs border border-line px-3 py-1.5 rounded-md disabled:opacity-40"
                    >
                        Previous
                    </button>
                    <span className="text-ash text-xs">
                        Page {meta.page} of {meta.totalPages} · {meta.total} total
                    </span>
                    <button
                        type="button"
                        onClick={() => changePage(page + 1)}
                        disabled={page >= meta.totalPages || loading}
                        className="text-xs border border-line px-3 py-1.5 rounded-md disabled:opacity-40"
                    >
                        Next
                    </button>
                </nav>
            )}

            <ConfirmDialog
                open={!!bulkAction}
                title={bulkAction ? `${BULK_LABELS[bulkAction].confirm.replace(" all", "")} ${selectableFor(bulkAction).filter((id) => selection.selectedIds.includes(id)).length} withdrawal(s)?` : ""}
                description={bulkAction === "paid"
                    ? "Only confirm once the money has actually been sent to every selected seller."
                    : bulkAction === "reject"
                        ? "Each amount returns to its seller's wallet."
                        : "Each seller is told their withdrawal was approved."}
                confirmLabel={bulkAction ? BULK_LABELS[bulkAction].confirm : "Confirm"}
                danger={bulkAction === "reject"}
                onConfirm={runBulkWithdrawal}
                onCancel={() => setBulkAction(null)}
            />

            <ConfirmDialog
                open={!!pending}
                title={
                    pending?.action === "approve" ? "Approve this withdrawal?"
                        : pending?.action === "reject" ? "Reject and refund this withdrawal?"
                            : "Mark this withdrawal as paid?"
                }
                description={pending ? `${formatMoney(pending.w.amount)} for ${pending.w.store_name || `${pending.w.first_name} ${pending.w.last_name}`}. ${
                    pending.action === "paid" ? "Only confirm once the money has actually been sent." : pending.action === "reject" ? "The amount returns to the seller's wallet." : "The seller is told it was approved."
                }` : ""}
                confirmLabel={pending?.action === "approve" ? "Approve" : pending?.action === "reject" ? "Reject & refund" : "Mark as paid"}
                danger={pending?.action === "reject"}
                onConfirm={() => act(pending.w.id, pending.action)}
                onCancel={() => setPending(null)}
            />
        </div>
    );
}
