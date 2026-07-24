import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";

const DOC_LABELS = {
    national_id: "National ID",
    voter_id: "Voter ID",
    business_registration: "Business registration"
};

export default function AdminVerifications() {
    const [pending, setPending] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [expanded, setExpanded] = useState(null);
    const [documents, setDocuments] = useState({});
    const [busyId, setBusyId] = useState(null);
    const [reasons, setReasons] = useState({});

    const load = () => {
        api.get("/admin/verifications").then(({ data }) => setPending(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const toggleExpand = async (sellerId) => {
        if (expanded === sellerId) {
            setExpanded(null);
            return;
        }
        setExpanded(sellerId);
        if (!documents[sellerId]) {
            const { data } = await api.get(`/admin/verifications/${sellerId}/documents`);
            setDocuments((d) => ({ ...d, [sellerId]: data.data }));
        }
    };

    const approve = async (sellerId) => {
        setBusyId(sellerId);
        setError("");
        try {
            await api.put(`/admin/verifications/${sellerId}/approve`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    const reject = async (sellerId) => {
        const reason = reasons[sellerId]?.trim();
        if (!reason) {
            setError("Enter a rejection reason first.");
            return;
        }
        setBusyId(sellerId);
        setError("");
        try {
            await api.put(`/admin/verifications/${sellerId}/reject`, { reason });
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <p className="text-ash">Loading verification requests…</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-6">Seller verifications</h1>
            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            {pending.length === 0 && <p className="text-ash text-sm">No pending verification requests.</p>}

            <ul className="divide-y divide-line border-y border-line">
                {pending.map((s) => (
                    <li key={s.user_id} className="py-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{s.store_name}</p>
                                <p className="text-xs text-ash truncate">
                                    {s.first_name} {s.last_name} · {s.email} · {s.phone}
                                </p>
                                <p className="text-xs text-ash">
                                    Submitted {s.verification_submitted_at ? new Date(s.verification_submitted_at).toLocaleString() : "—"}
                                    {s.verification_fee_paid ? " · Fee already paid" : " · Fee not yet paid"}
                                </p>
                            </div>

                            <button
                                onClick={() => toggleExpand(s.user_id)}
                                className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink transition-colors"
                            >
                                {expanded === s.user_id ? "Hide documents" : "View documents"}
                            </button>

                            <button
                                onClick={() => approve(s.user_id)}
                                disabled={busyId === s.user_id}
                                className="text-xs bg-teal text-paper px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                                Approve
                            </button>
                        </div>

                        {expanded === s.user_id && (
                            <div className="mt-3 pl-1 space-y-3">
                                <ul className="text-sm space-y-1">
                                    {(documents[s.user_id] || []).map((doc) => (
                                        <li key={doc.id}>
                                            <span className="text-ash">{DOC_LABELS[doc.document_type] || doc.document_type}: </span>
                                            <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-azure hover:underline">
                                                View document
                                            </a>
                                        </li>
                                    ))}
                                    {documents[s.user_id]?.length === 0 && (
                                        <li className="text-ash">No documents found.</li>
                                    )}
                                </ul>

                                <div className="flex gap-2">
                                    <input
                                        placeholder="Rejection reason"
                                        value={reasons[s.user_id] || ""}
                                        onChange={(e) => setReasons({ ...reasons, [s.user_id]: e.target.value })}
                                        className="flex-1 border border-line rounded-md px-3 py-1.5 text-sm focus-ring"
                                    />
                                    <button
                                        onClick={() => reject(s.user_id)}
                                        disabled={busyId === s.user_id}
                                        className="text-xs border border-coral text-coral px-3 py-1.5 rounded-md hover:bg-coral/10 transition-colors disabled:opacity-50"
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
