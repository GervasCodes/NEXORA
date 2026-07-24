import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";

const DOC_LABELS = {
    owner_photo: "Owner photo / selfie",
    national_id: "National ID",
    voter_id: "Voter ID",
    drivers_license: "Driver's license"
};

const ROLE_LABELS = {
    seller: "Seller",
    delivery_agent: "Delivery agent"
};

const STATUS_TABS = [
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" }
];

// Reviews the verification documents (owner photo, National/Voter ID,
// driver's license for delivery agents) submitted as part of
// registration itself - distinct from the separate "Verifications" page,
// which handles the optional paid Verified Seller badge.
export default function AdminAccountVerifications() {
    const [status, setStatus] = useState("pending");
    const [role, setRole] = useState("");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [expanded, setExpanded] = useState(null);
    const [detail, setDetail] = useState({});
    const [busyId, setBusyId] = useState(null);
    const [reasons, setReasons] = useState({});

    const load = () => {
        setLoading(true);
        const params = { status };
        if (role) params.role = role;
        api.get("/admin/account-verifications", { params })
            .then(({ data }) => setRows(data.data))
            .catch((err) => setError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(load, [status, role]);

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
        setError("");
        try {
            await api.put(`/admin/account-verifications/${userId}/approve`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const reject = async (userId) => {
        const reason = reasons[userId]?.trim();
        if (!reason) {
            setError("Enter a rejection reason first.");
            return;
        }
        setBusyId(userId);
        setError("");
        try {
            await api.put(`/admin/account-verifications/${userId}/reject`, { reason });
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Account verifications</h1>
            <p className="text-ash text-sm mb-6">
                Documents submitted by sellers and delivery agents at registration.
            </p>

            <div className="flex flex-wrap items-center gap-4 mb-6">
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
                    className="text-sm border border-line rounded-md px-3 py-1.5 focus-ring bg-paper"
                >
                    <option value="">All roles</option>
                    <option value="seller">Sellers</option>
                    <option value="delivery_agent">Delivery agents</option>
                </select>
            </div>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}
            {loading && <p className="text-ash text-sm">Loading…</p>}

            {!loading && rows.length === 0 && (
                <p className="text-ash text-sm">No {status} accounts{role ? ` (${ROLE_LABELS[role]})` : ""}.</p>
            )}

            <ul className="divide-y divide-line border-y border-line">
                {rows.map((r) => (
                    <li key={r.id} className="py-4">
                        <div className="flex flex-wrap items-center gap-3">
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
                                    className="text-xs bg-teal text-paper px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
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
                                                <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-azure hover:underline">
                                                    View document
                                                </a>
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
        </div>
    );
}
