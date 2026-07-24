import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { formatDate } from "../utils/format";

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

const RESOLUTIONS = [
    { value: "refund_full", label: "Full refund" },
    { value: "refund_partial", label: "Partial refund" },
    { value: "replacement", label: "Send a replacement" },
    { value: "compensation", label: "Other compensation" },
    { value: "no_action", label: "No action" }
];

export default function DisputeDetail() {
    const { id } = useParams();
    const { user } = useAuth();
    const { format } = useCurrency();
    const fileInputRef = useRef(null);

    const [dispute, setDispute] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");

    const [resolution, setResolution] = useState("");
    const [resolutionNote, setResolutionNote] = useState("");
    const [refundAmount, setRefundAmount] = useState("");
    const [rejectReason, setRejectReason] = useState("");
    const [showReject, setShowReject] = useState(false);

    const load = () => {
        api.get(`/disputes/${id}`)
            .then(({ data }) => setDispute(data.data))
            .catch((err) => setLoadError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(load, [id]);

    const isBuyer = user?.role === "buyer" && dispute?.buyer_id === user.id;
    const isSeller = user?.role === "seller" && dispute?.seller_id === user.id;
    const isAdmin = user?.role === "admin";
    const canAct = ["open", "under_review"].includes(dispute?.status);
    const canMessage = !["resolved", "rejected", "withdrawn"].includes(dispute?.status || "");

    const senderRole = isAdmin ? "admin" : isSeller ? "seller" : "buyer";

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!message.trim()) return;
        setBusy("message");
        setError("");
        try {
            await api.post(`/disputes/${id}/messages`, { message });
            setMessage("");
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy("");
        }
    };

    const uploadEvidence = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBusy("evidence");
        setError("");
        try {
            const formData = new FormData();
            formData.append("file", file);
            await api.post(`/disputes/${id}/evidence`, formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy("");
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const withdraw = async () => {
        if (!window.confirm("Withdraw this dispute? This can't be undone.")) return;
        setBusy("withdraw");
        setError("");
        try {
            await api.put(`/disputes/${id}/withdraw`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy("");
        }
    };

    const markUnderReview = async () => {
        setBusy("review");
        setError("");
        try {
            await api.put(`/disputes/admin/${id}/review`);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy("");
        }
    };

    const resolve = async (e) => {
        e.preventDefault();
        setBusy("resolve");
        setError("");
        try {
            await api.put(`/disputes/admin/${id}/resolve`, {
                resolution,
                resolution_note: resolutionNote || undefined,
                refund_amount: resolution === "refund_partial" ? Number(refundAmount) : undefined
            });
            setResolution("");
            setResolutionNote("");
            setRefundAmount("");
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy("");
        }
    };

    const reject = async (e) => {
        e.preventDefault();
        setBusy("reject");
        setError("");
        try {
            await api.put(`/disputes/admin/${id}/reject`, { resolution_note: rejectReason });
            setRejectReason("");
            setShowReject(false);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy("");
        }
    };

    if (loading) return <div className="max-w-2xl mx-auto px-6 py-16 text-ash">Loading dispute…</div>;

    if (loadError || !dispute) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">Dispute not found</p>
                <p className="text-ash text-sm">{loadError}</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
                <div>
                    <p className="text-xs uppercase tracking-widest text-ash mb-1">Dispute</p>
                    <h1 className="price font-display text-2xl">{dispute.dispute_number}</h1>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[dispute.status] || "bg-line text-ash"}`}>
                    {dispute.status.replace("_", " ")}
                </span>
            </div>
            <p className="text-sm text-ash mb-6">
                On order <Link to={`/orders/${dispute.order_id}`} className="text-teal hover:underline">#{dispute.order_id}</Link> · filed {formatDate(dispute.created_at)}
            </p>

            {error && <p className="text-sm text-coral mb-4">{error}</p>}

            <div className="border border-line rounded-lg p-4 mb-6">
                <p className="text-xs text-ash mb-1">{TYPE_LABELS[dispute.type] || dispute.type}</p>
                <p className="font-medium mb-2">{dispute.subject}</p>
                <p className="text-sm text-ink/80 whitespace-pre-wrap">{dispute.description}</p>
            </div>

            {dispute.status === "resolved" && (
                <div className="border border-teal/30 bg-teal/5 rounded-lg p-4 mb-6">
                    <p className="text-sm font-medium text-teal mb-1">
                        Resolved: {RESOLUTIONS.find((r) => r.value === dispute.resolution)?.label || dispute.resolution}
                    </p>
                    {dispute.refund_amount && (
                        <p className="text-sm text-teal mb-1">Refund amount: {format(dispute.refund_amount)}</p>
                    )}
                    {dispute.resolution_note && <p className="text-sm text-ink/80">{dispute.resolution_note}</p>}
                </div>
            )}

            {dispute.status === "rejected" && (
                <div className="border border-coral/30 bg-coral/5 rounded-lg p-4 mb-6">
                    <p className="text-sm font-medium text-coral mb-1">Dispute rejected</p>
                    {dispute.resolution_note && <p className="text-sm text-ink/80">{dispute.resolution_note}</p>}
                </div>
            )}

            {/* Evidence */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs uppercase tracking-widest text-ash">Evidence</p>
                    {(isBuyer || isSeller) && canAct && (
                        <label className="text-xs text-teal hover:underline cursor-pointer">
                            {busy === "evidence" ? "Uploading…" : "+ Add photo"}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={uploadEvidence}
                                disabled={busy === "evidence"}
                                className="hidden"
                            />
                        </label>
                    )}
                </div>
                {dispute.evidence?.length === 0 ? (
                    <p className="text-sm text-ash">No photos attached yet.</p>
                ) : (
                    <div className="grid grid-cols-3 gap-2">
                        {dispute.evidence.map((ev) => (
                            <a key={ev.id} href={ev.file_url} target="_blank" rel="noreferrer" className="block aspect-square rounded-md overflow-hidden border border-line">
                                <img src={ev.file_url} alt="Evidence" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                            </a>
                        ))}
                    </div>
                )}
            </div>

            {/* Admin resolution controls */}
            {isAdmin && canAct && (
                <div className="border border-line rounded-lg p-4 mb-8 space-y-4">
                    <p className="text-xs uppercase tracking-widest text-ash">Resolve this dispute</p>

                    {dispute.status === "open" && (
                        <button
                            onClick={markUnderReview}
                            disabled={busy === "review"}
                            className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-abyss transition-colors disabled:opacity-50"
                        >
                            {busy === "review" ? "Updating…" : "Mark as under review"}
                        </button>
                    )}

                    <form onSubmit={resolve} className="space-y-3">
                        <select
                            required
                            value={resolution}
                            onChange={(e) => setResolution(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring bg-paper"
                        >
                            <option value="" disabled>Choose a resolution</option>
                            {RESOLUTIONS.filter((r) => r.value !== "no_action").map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>

                        {resolution === "refund_partial" && (
                            <input
                                type="number"
                                required
                                min="1"
                                step="0.01"
                                placeholder="Refund amount"
                                value={refundAmount}
                                onChange={(e) => setRefundAmount(e.target.value)}
                                className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                            />
                        )}

                        <textarea
                            rows={2}
                            placeholder="Optional note to buyer & seller"
                            value={resolutionNote}
                            onChange={(e) => setResolutionNote(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring resize-none"
                        />

                        <button
                            type="submit"
                            disabled={!resolution || busy === "resolve"}
                            className="bg-teal text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-teal/90 transition-colors disabled:opacity-50"
                        >
                            {busy === "resolve" ? "Resolving…" : "Resolve dispute"}
                        </button>
                    </form>

                    {!showReject ? (
                        <button onClick={() => setShowReject(true)} className="text-xs text-coral hover:underline">
                            Reject this dispute instead
                        </button>
                    ) : (
                        <form onSubmit={reject} className="space-y-2">
                            <textarea
                                required
                                rows={2}
                                placeholder="Reason for rejecting"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                className="w-full border border-coral/40 rounded-md px-3 py-2 text-sm focus-ring resize-none"
                            />
                            <div className="flex gap-2">
                                <button
                                    type="submit"
                                    disabled={busy === "reject"}
                                    className="text-xs bg-coral text-white px-3 py-1.5 rounded-md disabled:opacity-50"
                                >
                                    {busy === "reject" ? "Rejecting…" : "Confirm reject"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowReject(false)}
                                    className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            )}

            {/* Buyer withdraw */}
            {isBuyer && canAct && (
                <div className="mb-8">
                    <button
                        onClick={withdraw}
                        disabled={busy === "withdraw"}
                        className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-coral hover:text-coral transition-colors disabled:opacity-50"
                    >
                        {busy === "withdraw" ? "Withdrawing…" : "Withdraw dispute"}
                    </button>
                </div>
            )}

            {/* Messages thread */}
            <div>
                <p className="text-xs uppercase tracking-widest text-ash mb-3">Discussion</p>
                <ul className="space-y-3 mb-4">
                    {dispute.messages?.length === 0 && (
                        <li className="text-sm text-ash">No messages yet.</li>
                    )}
                    {dispute.messages?.map((m) => (
                        <li key={m.id} className="border border-line rounded-lg p-3">
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="text-xs font-medium capitalize">
                                    {m.first_name} {m.last_name} <span className="text-ash">· {m.sender_role}</span>
                                </p>
                                <p className="text-xs text-ash whitespace-nowrap">{formatDate(m.created_at)}</p>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{m.message}</p>
                        </li>
                    ))}
                </ul>

                {canMessage ? (
                    <form onSubmit={sendMessage} className="space-y-2">
                        <textarea
                            rows={2}
                            placeholder={`Reply as ${senderRole}…`}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring resize-none"
                        />
                        <button
                            type="submit"
                            disabled={!message.trim() || busy === "message"}
                            className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:bg-abyss transition-colors disabled:opacity-60"
                        >
                            {busy === "message" ? "Sending…" : "Send"}
                        </button>
                    </form>
                ) : (
                    <p className="text-xs text-ash">This dispute is closed for new messages.</p>
                )}
            </div>
        </div>
    );
}
