import ConfirmDialog from "../../components/ConfirmDialog";
import { useEffect, useState } from "react";
import api from "../../api/client";
import { formatMoney, formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import PageMeta from "../../components/PageMeta";
import EmptyState from "../../components/ui/EmptyState";
import AdminPager from "../../components/admin/AdminPager";

const PAGE_SIZE = 25;
const STATUS_OPTIONS = ["pending", "processing", "shipped", "delivered", "cancelled"];

const statusStyles = {
    pending: "bg-line text-ash",
    processing: "bg-mango/20 text-mango-dark",
    shipped: "bg-teal/10 text-teal",
    delivered: "bg-teal text-white",
    cancelled: "bg-coral/10 text-coral"
};

const SORT_OPTIONS = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "item_name", label: "Item name (A-Z)" },
    { value: "status", label: "Status" },
    { value: "amount_high", label: "Amount (high to low)" },
    { value: "amount_low", label: "Amount (low to high)" }
];

export default function AdminOrders() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [releasing, setReleasing] = useState(null);
    const [releaseNotes, setReleaseNotes] = useState({});
    const [releaseTarget, setReleaseTarget] = useState(null);
    const [sort, setSort] = useState("newest");
    const [meta, setMeta] = useState(null);
    const [page, setPage] = useState(1);
    const [searchInput, setSearchInput] = useState("");
    const [filters, setFilters] = useState({ q: "", status: "" });

    // Server-side paging, search and status filter. Order number, buyer
    // name/email and payment reference are all searchable.
    const load = (nextPage = page, nextFilters = filters, nextSort = sort) => {
        setLoading(true);
        const params = { sort: nextSort, page: nextPage, pageSize: PAGE_SIZE };
        if (nextFilters.q) params.q = nextFilters.q;
        if (nextFilters.status) params.status = nextFilters.status;
        api.get("/admin/orders", { params })
            .then(({ data }) => {
                setOrders(data.data);
                setMeta(data.meta);
            })
            .catch(() => setOrders([]))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const applyFilters = (next) => {
        setFilters(next);
        setPage(1);
        load(1, next, sort);
    };

    const submitSearch = (e) => {
        e.preventDefault();
        applyFilters({ ...filters, q: searchInput.trim() });
    };

    const changeSort = (value) => {
        setSort(value);
        setPage(1);
        load(1, filters, value);
    };

    const changePage = (next) => {
        setPage(next);
        load(next, filters, sort);
    };

    //  manual early release - bypasses the normal delivered +
    // escrow_hold_days timing gate for one order, but the backend still
    // refuses to release anything covered by an open dispute. See
    // docs/ESCROW_ANALYSIS.md section 3.4.
    const releaseEscrow = async (orderId) => {
        setReleaseTarget(null);
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

    if (loading && !meta) return <PageLoader />;

    return (
        <div>
            <PageMeta title="Orders" noIndex />
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h1 className="font-display text-2xl">All orders</h1>
                <select
                    value={sort}
                    onChange={(e) => changeSort(e.target.value)}
                    className="border border-line rounded-md px-3 py-1.5 text-sm focus-ring"
                    aria-label="Sort"
                >
                    {SORT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>

            <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center">
                <form onSubmit={submitSearch} className="flex gap-2 flex-1">
                    <input
                        type="search"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search order number, buyer, email or payment reference"
                        aria-label="Search orders"
                        className="flex-1 border border-line rounded-md px-3 py-1.5 text-sm"
                    />
                    <button type="submit" className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink">
                        Search
                    </button>
                </form>
                <select
                    value={filters.status}
                    onChange={(e) => applyFilters({ ...filters, status: e.target.value })}
                    aria-label="Filter by status"
                    className="border border-line rounded-md px-3 py-1.5 text-sm capitalize"
                >
                    <option value="">All statuses</option>
                    {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
            </div>

            {loading && <p className="text-xs text-ash mb-4">Loading…</p>}
            {!loading && orders.length === 0 && (
                <EmptyState title={filters.q || filters.status ? "No orders match these filters." : "No orders yet."} />
            )}

            <ul className="divide-y divide-line border-y border-line">
                {orders.map((o) => (
                    <li key={o.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                                {o.first_name} {o.last_name}
                            </p>
                            {o.primary_item_name && (
                                <p className="text-xs text-ash truncate">{o.primary_item_name}</p>
                            )}
                            <p className="price text-xs text-ash truncate">
                                <span>{o.order_number}</span> · <span>{o.email}</span>
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:shrink-0">
                            <p className="text-xs text-ash">{formatDate(o.created_at)}</p>

                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusStyles[o.status] || "bg-line text-ash"}`}>
                                {o.status}
                            </span>

                            <span className="text-xs text-ash capitalize">{o.payment_status}</span>

                            <p className="price text-sm font-medium">{formatMoney(o.total_amount)}</p>
                        </div>

                        {o.status === "delivered" && (
                            <div className="w-full sm:w-auto sm:text-right">
                                <button
                                    onClick={() => setReleaseTarget(o)}
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

            <AdminPager meta={meta} onChange={changePage} disabled={loading} label="Order pages" />

            <ConfirmDialog
                open={!!releaseTarget}
                title="Release held earnings early?"
                description={releaseTarget ? `Order ${releaseTarget.order_number || `#${releaseTarget.id}`}: this skips the normal escrow hold and pays the seller now. Anything covered by an open dispute stays frozen.` : ""}
                confirmLabel="Release now"
                danger
                onConfirm={() => releaseEscrow(releaseTarget.id)}
                onCancel={() => setReleaseTarget(null)}
            />
        </div>
    );
}
