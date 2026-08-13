import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";

// Mirrors backend/src/modules/audit/audit.constants.js's EVENT_TYPE_GROUPS -
// the `value` here is exactly the `category` query param the backend
// groups event types by, so keeping this list in sync with that file is
// what makes the dropdown filter each group at once.
const CATEGORIES = [
    { value: "", label: "All events" },
    { value: "account", label: "Account (suspensions, deletions, registrations)" },
    { value: "admin", label: "Admin management (permissions, admin accounts)" },
    { value: "auth", label: "Logins" },
    { value: "orders", label: "Orders" },
    { value: "payments", label: "Payments" },
    { value: "refunds", label: "Refunds" }
];

const EVENT_TYPE_STYLES = {
    account_suspended: "bg-coral/10 text-coral",
    account_unsuspended: "bg-teal/10 text-teal",
    account_permanently_deleted: "bg-coral text-white",
    user_account_deleted: "bg-coral/10 text-coral",
    admin_account_deleted: "bg-coral text-white",
    admin_account_created: "bg-teal/10 text-teal",
    admin_permissions_changed: "bg-mango/20 text-mango-dark",
    login_failed: "bg-mango/20 text-mango-dark",
    login_success: "bg-line text-ash"
};

function formatDateTime(value) {
    return new Date(value).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function eventTypeLabel(eventType) {
    return eventType.replace(/[_.]/g, " ");
}

const PAGE_SIZE = 25;

export default function AdminAuditLogs() {
    const [logs, setLogs] = useState([]);
    const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [expandedId, setExpandedId] = useState(null);

    const [category, setCategory] = useState("");
    const [adminActionsOnly, setAdminActionsOnly] = useState(false);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);

    // Search box is free text over description/actor/metadata - debounced
    // so every keystroke doesn't fire a request, same reasoning any
    // search-as-you-type field needs.
    const [qInput, setQInput] = useState("");
    useEffect(() => {
        const handle = setTimeout(() => { setQ(qInput); setPage(1); }, 400);
        return () => clearTimeout(handle);
    }, [qInput]);

    useEffect(() => {
        setLoading(true);
        setError("");

        const params = { page, page_size: PAGE_SIZE };
        if (category) params.category = category;
        if (adminActionsOnly) params.admin_actions_only = true;
        if (dateFrom) params.date_from = `${dateFrom} 00:00:00`;
        if (dateTo) params.date_to = `${dateTo} 23:59:59`;
        if (q.trim()) params.q = q.trim();

        api.get("/admin/audit-logs", { params })
            .then(({ data }) => {
                setLogs(data.data);
                setMeta(data.meta || { total: data.data.length, page: 1, totalPages: 1 });
            })
            .catch((err) => setError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    }, [category, adminActionsOnly, dateFrom, dateTo, q, page]);

    const resetFilters = () => {
        setCategory("");
        setAdminActionsOnly(false);
        setDateFrom("");
        setDateTo("");
        setQ("");
        setQInput("");
        setPage(1);
    };

    return (
        <div>
            <PageMeta title="Audit Logs" noIndex />
            <h1 className="font-display text-2xl mb-1">Audit logs</h1>
            <p className="text-ash text-sm mb-6">
                Suspensions, unsuspensions, deletions, permission changes, and admin logins/actions across the platform.
            </p>

            <div className="border border-line rounded-lg p-4 mb-6 space-y-3">
                <div className="flex flex-wrap gap-3">
                    <input
                        type="text"
                        placeholder="Search description, actor, or details…"
                        value={qInput}
                        onChange={(e) => setQInput(e.target.value)}
                        className="flex-1 min-w-[220px] border border-line rounded-md px-3 py-1.5 text-sm"
                    />
                    <select
                        value={category}
                        onChange={(e) => { setCategory(e.target.value); setPage(1); }}
                        className="border border-line rounded-md px-3 py-1.5 text-sm"
                    >
                        {CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <label className="text-xs text-ash flex items-center gap-1">
                        From
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                            className="border border-line rounded-md px-2 py-1 text-sm"
                        />
                    </label>
                    <label className="text-xs text-ash flex items-center gap-1">
                        To
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                            className="border border-line rounded-md px-2 py-1 text-sm"
                        />
                    </label>
                    <label className="text-xs text-ash flex items-center gap-1.5">
                        <input
                            type="checkbox"
                            checked={adminActionsOnly}
                            onChange={(e) => { setAdminActionsOnly(e.target.checked); setPage(1); }}
                        />
                        Admin logins/actions only
                    </label>
                    <button
                        onClick={resetFilters}
                        className="text-xs text-ash underline hover:text-ink transition-colors ml-auto"
                    >
                        Clear filters
                    </button>
                </div>
            </div>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            {loading ? (
                <p className="text-ash text-sm">Loading audit logs…</p>
            ) : logs.length === 0 ? (
                <p className="text-ash text-sm">No audit log entries match these filters.</p>
            ) : (
                <>
                    <ul className="space-y-2">
                        {logs.map((log) => (
                            <li key={log.id} className="border border-line rounded-lg p-3">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${EVENT_TYPE_STYLES[log.event_type] || "bg-line text-ash"}`}>
                                            {eventTypeLabel(log.event_type)}
                                        </span>
                                        <span className="text-xs text-ash">{formatDateTime(log.created_at)}</span>
                                    </div>
                                    <button
                                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                                        className="text-xs text-ash underline hover:text-ink transition-colors"
                                    >
                                        {expandedId === log.id ? "Hide details" : "Details"}
                                    </button>
                                </div>

                                <p className="text-sm text-ink/90 mt-2">{log.description || "—"}</p>

                                <p className="text-xs text-ash mt-1">
                                    {log.actor_email
                                        ? `${log.actor_first_name} ${log.actor_last_name} (${log.actor_email})${log.actor_role ? ` · ${log.actor_role}` : ""}`
                                        : "System / unattributed"}
                                    {log.ip_address ? ` · ${log.ip_address}` : ""}
                                </p>

                                {expandedId === log.id && log.metadata && (
                                    <pre className="mt-2 bg-line/40 rounded-md p-2 text-xs overflow-x-auto">
                                        {JSON.stringify(typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata, null, 2)}
                                    </pre>
                                )}
                            </li>
                        ))}
                    </ul>

                    <div className="flex items-center justify-between mt-6 text-sm">
                        <p className="text-ash text-xs">{meta.total} total entries</p>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={meta.page <= 1}
                                className="text-xs border border-line px-3 py-1.5 rounded-md disabled:opacity-40"
                            >
                                Previous
                            </button>
                            <span className="text-xs text-ash">Page {meta.page} of {meta.totalPages}</span>
                            <button
                                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                                disabled={meta.page >= meta.totalPages}
                                className="text-xs border border-line px-3 py-1.5 rounded-md disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
