import PrivateDocumentLink from "../../components/PrivateDocumentLink";
import { useEffect, useMemo, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import EmptyState from "../../components/ui/EmptyState";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../context/ToastContext";
import AdminVerificationReview, { DOC_LABELS } from "../../components/admin/AdminVerificationReview";
import {
    BulkBar,
    SortButton,
    bulkSummary,
    runBulk,
    useRowSelection,
    useSortedRows
} from "../../components/admin/AdminTableTools";

const ROLE_LABELS = {
    seller: "Seller",
    delivery_agent: "Delivery agent"
};

const STATUS_TABS = [
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" }
];

// Sort accessors live outside the component so their identity is stable
// and useSortedRows doesn't re-sort on every render.
const ACCOUNT_SORTS = {
    name: (r) => `${r.first_name} ${r.last_name}`.toLowerCase(),
    role: (r) => r.role,
    submitted: (r) => (r.account_verification_submitted_at ? new Date(r.account_verification_submitted_at).getTime() : null)
};

function AccountReviews() {
    const [status, setStatus] = useState("pending");
    const [role, setRole] = useState("");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const toast = useToast();
    const [expanded, setExpanded] = useState(null);
    const [detail, setDetail] = useState({});
    const [busyId, setBusyId] = useState(null);
    const [reasons, setReasons] = useState({});
    const [reviewing, setReviewing] = useState(false);

    const selection = useRowSelection();
    const { sorted, sort, toggleSort } = useSortedRows(rows, ACCOUNT_SORTS, { key: "submitted", dir: "asc" });
    const [bulkAction, setBulkAction] = useState(null); // "approve" | "reject"
    const [bulkReason, setBulkReason] = useState("");
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkNote, setBulkNote] = useState("");

    const load = () => {
        setLoading(true);
        const params = { status };
        if (role) params.role = role;
        api.get("/admin/account-verifications", { params })
            .then(({ data }) => {
                setRows(data.data);
                selection.clear();
            })
            .catch((err) => toast?.error(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(load, [status, role, toast]); // eslint-disable-line react-hooks/exhaustive-deps

    const visibleIds = useMemo(() => sorted.map((r) => r.id), [sorted]);
    const pendingVisibleIds = status === "pending" ? visibleIds : [];

    const toggleExpand = async (userId) => {
        if (expanded === userId) {
            setExpanded(null);
            return;
        }
        setExpanded(userId);
        if (!detail[userId]) {
            const { data } = await api.get(`/admin/account-verifications/${userId}`);
            setDetail((d) => ({ ...d, [userId]: data.data }));
        }
    };

    const approve = async (userId) => {
        setBusyId(userId);
        try {
            await api.put(`/admin/account-verifications/${userId}/approve`);
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const reject = async (userId) => {
        const reason = reasons[userId]?.trim();
        if (!reason) {
            toast?.error("Enter a rejection reason first.");
            return;
        }
        setBusyId(userId);
        try {
            await api.put(`/admin/account-verifications/${userId}/reject`, { reason });
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const runBulkDecision = async () => {
        const ids = selection.selectedIds.filter((id) => pendingVisibleIds.includes(id));
        const action = bulkAction;
        setBulkBusy(true);
        const result = await runBulk(ids, (id) =>
            action === "approve"
                ? api.put(`/admin/account-verifications/${id}/approve`)
                : api.put(`/admin/account-verifications/${id}/reject`, { reason: bulkReason.trim() })
        );
        setBulkBusy(false);
        setBulkAction(null);
        setBulkReason("");
        setBulkNote(bulkSummary(action === "approve" ? "Approved" : "Rejected", result));
        load();
    };

    const openBulk = (action) => {
        if (action === "reject" && !bulkReason.trim()) {
            toast?.error("Enter a rejection reason for the selected accounts first.");
            return;
        }
        setBulkAction(action);
    };

    if (reviewing) {
        return (
            <AdminVerificationReview
                queue={rows}
                onExit={() => {
                    setReviewing(false);
                    load();
                }}
            />
        );
    }

    const selectedCount = selection.selectedIds.filter((id) => pendingVisibleIds.includes(id)).length;

    return (
        <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex gap-1">
                    {STATUS_TABS.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setStatus(tab.value)}
                            className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                                status === tab.value ? "bg-ink text-paper" : "text-ash hover:bg-line/50"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    aria-label="Filter by role"
                    className="text-sm border border-line rounded-md px-3 py-1.5 focus-ring bg-paper"
                >
                    <option value="">All roles</option>
                    <option value="seller">Sellers</option>
                    <option value="delivery_agent">Delivery agents</option>
                </select>

                {status === "pending" && rows.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setReviewing(true)}
                        className="ml-auto text-sm bg-ink text-paper px-3 py-1.5 rounded-md hover:opacity-90"
                    >
                        Start review queue ({rows.length})
                    </button>
                )}
            </div>

            {rows.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-ash">
                    <span>Sort:</span>
                    <SortButton label="Submitted" sortKey="submitted" sort={sort} onSort={toggleSort} />
                    <SortButton label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
                    <SortButton label="Role" sortKey="role" sort={sort} onSort={toggleSort} />
                </div>
            )}

            {status === "pending" && bulkNote && (
                <p role="status" className="text-xs text-ash mb-3">{bulkNote}</p>
            )}

            {status === "pending" && (
                <BulkBar count={selectedCount} onClear={selection.clear}>
                    <button
                        type="button"
                        onClick={() => openBulk("approve")}
                        disabled={bulkBusy}
                        className="text-xs bg-teal text-frost px-3 py-1.5 rounded-md disabled:opacity-50"
                    >
                        Approve selected
                    </button>
                    <input
                        value={bulkReason}
                        onChange={(e) => setBulkReason(e.target.value)}
                        placeholder="Reason for rejecting"
                        aria-label="Bulk rejection reason"
                        maxLength={255}
                        className="text-xs border border-line rounded-md px-2 py-1.5 w-56"
                    />
                    <button
                        type="button"
                        onClick={() => openBulk("reject")}
                        disabled={bulkBusy}
                        className="text-xs border border-coral text-coral px-3 py-1.5 rounded-md hover:bg-coral/10 disabled:opacity-50"
                    >
                        Reject selected
                    </button>
                </BulkBar>
            )}

            {loading && <p className="text-ash text-sm">Loading…</p>}

            {!loading && rows.length === 0 && (
                <EmptyState title={`No ${status} accounts${role ? ` (${ROLE_LABELS[role]})` : ""}.`} />
            )}

            <ul className="divide-y divide-line border-y border-line">
                {sorted.map((r) => (
                    <li key={r.id} className="py-4">
                        <div className="flex flex-wrap items-center gap-3">
                            {status === "pending" && (
                                <input
                                    type="checkbox"
                                    checked={selection.selectedIds.includes(r.id)}
                                    onChange={() => selection.toggle(r.id)}
                                    aria-label={`Select ${r.first_name} ${r.last_name}`}
                                />
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">
                                    {r.first_name} {r.last_name}{" "}
                                    <span className="text-xs text-ash font-normal">({ROLE_LABELS[r.role] || r.role})</span>
                                </p>
                                <p className="text-xs text-ash truncate">{r.email} · {r.phone}</p>
                                <p className="text-xs text-ash">
                                    Submitted {r.account_verification_submitted_at ? new Date(r.account_verification_submitted_at).toLocaleString() : "—"}
                                    {r.account_verification_reviewed_at && ` · Reviewed ${new Date(r.account_verification_reviewed_at).toLocaleString()}`}
                                </p>
                            </div>

                            <button
                                onClick={() => toggleExpand(r.id)}
                                className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors"
                            >
                                {expanded === r.id ? "Hide details" : "View details"}
                            </button>

                            {status === "pending" && (
                                <button
                                    onClick={() => approve(r.id)}
                                    disabled={busyId === r.id}
                                    className="text-xs bg-teal text-frost px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                                >
                                    Approve
                                </button>
                            )}
                        </div>

                        {expanded === r.id && (
                            <div className="mt-3 pl-1 space-y-4">
                                {r.role === "delivery_agent" && (detail[r.id]?.vehicle_type || detail[r.id]?.vehicle_plate_number) && (
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-ash mb-1">Vehicle</p>
                                        <p className="text-sm">
                                            {detail[r.id]?.vehicle_type && (
                                                <span className="capitalize">{detail[r.id].vehicle_type}</span>
                                            )}
                                            {detail[r.id]?.vehicle_plate_number && ` · Plate ${detail[r.id].vehicle_plate_number}`}
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <p className="text-xs uppercase tracking-wide text-ash mb-1">Documents</p>
                                    <ul className="text-sm space-y-1">
                                        {(detail[r.id]?.documents || []).map((doc) => (
                                            <li key={doc.id}>
                                                <span className="text-ash">{DOC_LABELS[doc.document_type] || doc.document_type}: </span>
                                                <PrivateDocumentLink kind="verification" doc={doc}>
                                                    View document
                                                </PrivateDocumentLink>
                                                {doc.flag_reason && <span className="ml-2 text-xs text-coral">Failing: {doc.flag_reason}</span>}
                                            </li>
                                        ))}
                                        {detail[r.id] && detail[r.id].documents.length === 0 && (
                                            <li className="text-ash">No documents found.</li>
                                        )}
                                    </ul>
                                </div>

                                {detail[r.id]?.history?.length > 0 && (
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-ash mb-1">History</p>
                                        <ul className="text-sm space-y-1">
                                            {detail[r.id].history.map((h) => (
                                                <li key={h.id} className="text-ash">
                                                    <span className="text-ink capitalize">{h.action}</span>
                                                    {h.actor_first_name && ` by ${h.actor_first_name} ${h.actor_last_name}`}
                                                    {" · "}{new Date(h.created_at).toLocaleString()}
                                                    {h.reason && ` — ${h.reason}`}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {r.account_verification_rejection_reason && status === "rejected" && (
                                    <p className="text-sm text-coral">
                                        Rejection reason: {r.account_verification_rejection_reason}
                                    </p>
                                )}

                                {status === "pending" && (
                                    <div className="flex gap-2">
                                        <input
                                            placeholder="Rejection reason"
                                            value={reasons[r.id] || ""}
                                            onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })}
                                            className="flex-1 border border-line rounded-md px-3 py-1.5 text-sm focus-ring"
                                        />
                                        <button
                                            onClick={() => reject(r.id)}
                                            disabled={busyId === r.id}
                                            className="text-xs border border-coral text-coral px-3 py-1.5 rounded-md hover:bg-coral/10 transition-colors disabled:opacity-50"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </li>
                ))}
            </ul>

            <ConfirmDialog
                open={!!bulkAction}
                title={bulkAction === "approve"
                    ? `Approve ${selectedCount} account${selectedCount === 1 ? "" : "s"}?`
                    : `Reject ${selectedCount} account${selectedCount === 1 ? "" : "s"}?`}
                description={bulkAction === "approve"
                    ? "Bulk approval doesn't open each document. Check the documents in the review queue first if you're unsure."
                    : `Every selected applicant will be told: "${bulkReason.trim()}"`}
                confirmLabel={bulkAction === "approve" ? "Approve all" : "Reject all"}
                danger={bulkAction === "reject"}
                onConfirm={runBulkDecision}
                onCancel={() => setBulkAction(null)}
            />
        </div>
    );
}

// Verified Business tier-upgrade requests: BRELA / TIN / business license
// submitted by sellers who already hold the ID-based Verified Seller badge.
function BusinessUpgradeReviews() {
    const [status, setStatus] = useState("pending");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const toast = useToast();
    const [expanded, setExpanded] = useState(null);
    const [detail, setDetail] = useState({});
    const [busyId, setBusyId] = useState(null);
    const [reasons, setReasons] = useState({});

    const load = () => {
        setLoading(true);
        api.get("/admin/account-verifications/business-requests", { params: { status } })
            .then(({ data }) => setRows(data.data))
            .catch((err) => toast?.error(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(load, [status, toast]);

    const toggleExpand = async (requestId) => {
        if (expanded === requestId) {
            setExpanded(null);
            return;
        }
        setExpanded(requestId);
        if (!detail[requestId]) {
            try {
                const { data } = await api.get(`/admin/account-verifications/business-requests/${requestId}`);
                setDetail((d) => ({ ...d, [requestId]: data.data }));
            } catch (err) {
                toast?.error(extractErrorMessage(err));
            }
        }
    };

    const review = async (requestId, action, body) => {
        setBusyId(requestId);
        try {
            await api.put(`/admin/account-verifications/business-requests/${requestId}/${action}`, body);
            setExpanded(null);
            load();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const reject = (requestId) => {
        const reason = reasons[requestId]?.trim();
        if (!reason) {
            toast?.error("Enter a rejection reason first.");
            return;
        }
        review(requestId, "reject", { reason });
    };

    return (
        <div>
            <div className="flex gap-1 mb-6">
                {STATUS_TABS.map((tab) => (
                    <button
                        key={tab.value}
                        onClick={() => setStatus(tab.value)}
                        className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                            status === tab.value ? "bg-ink text-paper" : "text-ash hover:bg-line/50"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading && <p className="text-ash text-sm">Loading…</p>}

            {!loading && rows.length === 0 && <EmptyState title={`No ${status} business upgrade requests.`} />}

            <ul className="divide-y divide-line border-y border-line">
                {rows.map((r) => (
                    <li key={r.id} className="py-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">
                                    {r.store_name || `${r.first_name} ${r.last_name}`}{" "}
                                    <span className="text-xs text-ash font-normal">({r.first_name} {r.last_name})</span>
                                </p>
                                <p className="text-xs text-ash truncate">{r.email} · {r.phone}</p>
                                <p className="text-xs text-ash">
                                    Submitted {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}
                                    {r.reviewed_at && ` · Reviewed ${new Date(r.reviewed_at).toLocaleString()}`}
                                </p>
                            </div>

                            <button
                                onClick={() => toggleExpand(r.id)}
                                className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors"
                            >
                                {expanded === r.id ? "Hide documents" : "Review documents"}
                            </button>

                            {status === "pending" && (
                                <button
                                    onClick={() => review(r.id, "approve")}
                                    disabled={busyId === r.id}
                                    className="text-xs bg-teal text-frost px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                                >
                                    Approve
                                </button>
                            )}
                        </div>

                        {expanded === r.id && (
                            <div className="mt-3 pl-1 space-y-4">
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-ash mb-1">Documents</p>
                                    <ul className="text-sm space-y-1">
                                        {(detail[r.id]?.documents || []).map((doc) => (
                                            <li key={doc.id}>
                                                <span className="text-ash">{DOC_LABELS[doc.document_type] || doc.document_type}: </span>
                                                <PrivateDocumentLink kind="verification" doc={doc}>
                                                    View document
                                                </PrivateDocumentLink>
                                            </li>
                                        ))}
                                        {detail[r.id] && detail[r.id].documents.length === 0 && (
                                            <li className="text-ash">No documents found.</li>
                                        )}
                                    </ul>
                                </div>

                                {r.rejection_reason && status === "rejected" && (
                                    <p className="text-sm text-coral">Rejection reason: {r.rejection_reason}</p>
                                )}

                                {status === "pending" && (
                                    <div className="flex gap-2">
                                        <input
                                            placeholder="Rejection reason"
                                            value={reasons[r.id] || ""}
                                            onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })}
                                            className="flex-1 border border-line rounded-md px-3 py-1.5 text-sm focus-ring"
                                        />
                                        <button
                                            onClick={() => reject(r.id)}
                                            disabled={busyId === r.id}
                                            className="text-xs border border-coral text-coral px-3 py-1.5 rounded-md hover:bg-coral/10 transition-colors disabled:opacity-50"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

const MODES = [
    { value: "accounts", label: "Account verifications" },
    { value: "business", label: "Verified Business upgrades" }
];

export default function AdminAccountVerifications() {
    const [mode, setMode] = useState("accounts");

    return (
        <div>
            <PageMeta title="Account Verifications" noIndex />
            <h1 className="font-display text-2xl mb-1">Account verifications</h1>
            <p className="text-ash text-sm mb-6">
                {mode === "accounts"
                    ? "Documents submitted by sellers and delivery agents at registration."
                    : "BRELA, TIN and business license documents submitted by sellers applying for the Verified Business badge."}
            </p>

            <div className="flex gap-1 mb-6 border-b border-line">
                {MODES.map((m) => (
                    <button
                        key={m.value}
                        onClick={() => setMode(m.value)}
                        className={`text-sm px-3 py-2 -mb-px border-b-2 transition-colors ${
                            mode === m.value ? "border-ink text-ink" : "border-transparent text-ash hover:text-ink"
                        }`}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            {mode === "accounts" ? <AccountReviews /> : <BusinessUpgradeReviews />}
        </div>
    );
}
