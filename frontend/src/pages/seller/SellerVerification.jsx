import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import { formatMoney } from "../../utils/format";

const DOC_LABELS = {
    national_id: "National ID",
    voter_id: "Voter ID",
    business_registration: "Business ownership / registration document"
};

export default function SellerVerification() {
    const { refreshProfile } = useOutletContext();
    const [verification, setVerification] = useState(null);
    const [files, setFiles] = useState({});
    const [phone, setPhone] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [paying, setPaying] = useState(false);
    
    const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
    const pollRef = useRef(null);

    const load = () => {
        return api.get("/seller/verification").then(({ data }) => {
            setVerification(data.data);
            return data.data;
        }).catch(() => null);
    };

    useEffect(() => {
        load();
        return () => clearInterval(pollRef.current);
    }, []);

    
    const pollForConfirmation = () => {
        let attempts = 0;
        clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            attempts += 1;
            const latest = await load();

            if (latest?.verification_fee_paid) {
                clearInterval(pollRef.current);
                setAwaitingConfirmation(false);
                setMessage("Verification fee confirmed. Your badge is now active.");
                refreshProfile?.();
                return;
            }

            if (attempts >= 30) {
                clearInterval(pollRef.current);
                setAwaitingConfirmation(false);
                setMessage("");
                setError("We haven't received confirmation yet. If you completed the payment on your phone, this page will update automatically once it's confirmed - you can also refresh later.");
            }
        }, 4000);
    };

    const canSubmit = verification && ["unverified", "rejected"].includes(verification.verification_status);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setMessage("");

        if (!files.national_id || !files.voter_id || !files.business_registration) {
            setError("Please attach all three documents.");
            return;
        }

        const formData = new FormData();
        formData.append("national_id", files.national_id);
        formData.append("voter_id", files.voter_id);
        formData.append("business_registration", files.business_registration);

        setSubmitting(true);
        try {
            const { data } = await api.post("/seller/verification/documents", formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            setVerification(data.data);
            setMessage("Documents submitted. An admin will review them shortly.");
            refreshProfile?.();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const handlePay = async (e) => {
        e.preventDefault();
        setError("");
        setMessage("");
        setPaying(true);
        try {
            const { data } = await api.post("/seller/verification/fee", { phone });
            
            setMessage(data.message || "Check your phone to complete the payment.");
            setAwaitingConfirmation(true);
            pollForConfirmation();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setPaying(false);
        }
    };

    if (!verification) return <p className="text-ash">Loading verification status…</p>;

    return (
        <div>
            <h1 className="font-display text-2xl mb-1">Seller verification</h1>
            <p className="text-ash text-sm mb-6">
                Verified sellers can add and sell products, and unlock the paid Verified Seller badge with advanced
                analytics, revenue reports, and premium tools.
            </p>

            <div className="mb-6 flex flex-wrap items-center gap-2">
                <StatusPill status={verification.verification_status} />
                {verification.is_verified && (
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-mango/10 text-mango-dark">
                        ✓ Verified Seller badge active
                    </span>
                )}
            </div>

            {verification.verification_status === "rejected" && verification.verification_rejection_reason && (
                <p className="text-sm text-coral mb-6 border border-coral/30 rounded-md px-3 py-2">
                    Rejection reason: {verification.verification_rejection_reason}
                </p>
            )}

            {error && <p className="text-coral text-sm mb-4">{error}</p>}
            {message && <p className="text-teal text-sm mb-4">{message}</p>}

            {canSubmit && (
                <form onSubmit={handleSubmit} className="space-y-4 mb-10 max-w-md glass-strong rounded-lg p-5">
                    <h2 className="font-display text-lg">Submit documents</h2>
                    {Object.entries(DOC_LABELS).map(([key, label]) => (
                        <div key={key}>
                            <label className="block text-sm mb-1">{label}</label>
                            <input type="file" accept="image/*,application/pdf" required
                                onChange={(e) => setFiles({ ...files, [key]: e.target.files[0] })}
                                className="w-full text-sm border border-line rounded-md px-3 py-2 focus-ring" />
                        </div>
                    ))}
                    <button type="submit" disabled={submitting}
                        className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:bg-abyss transition-colors disabled:opacity-60">
                        {submitting ? "Submitting…" : "Submit for review"}
                    </button>
                </form>
            )}

            {verification.verification_status === "pending" && (
                <p className="text-sm text-ash mb-10">
                    Submitted {verification.verification_submitted_at ? new Date(verification.verification_submitted_at).toLocaleString() : ""}.
                    Your documents are under admin review.
                </p>
            )}

            {verification.documents?.length > 0 && (
                <div className="mb-10">
                    <h2 className="font-display text-lg mb-3">Submitted documents</h2>
                    <ul className="divide-y divide-line border-y border-line">
                        {verification.documents.map((doc) => (
                            <li key={doc.id} className="py-2 flex items-center justify-between text-sm">
                                <span>{DOC_LABELS[doc.document_type] || doc.document_type}</span>
                                <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-azure hover:underline">
                                    View
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {!verification.verification_fee_paid && (
                <form onSubmit={handlePay} className="space-y-3 max-w-md glass-strong rounded-lg p-5">
                    <h2 className="font-display text-lg">Pay verification fee</h2>
                    <p className="text-sm text-ash">
                        One-time fee of {formatMoney(verification.required_fee)} to unlock the Verified Seller badge
                        {verification.verification_status !== "approved" && " once your documents are approved"}.
                    </p>

                    {awaitingConfirmation && (
                        <p className="text-sm text-azure-deep bg-azure/10 rounded-md px-3 py-2 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-azure-deep animate-pulse shrink-0" />
                            Waiting for payment confirmation on your phone…
                        </p>
                    )}

                    <div>
                        <label className="block text-sm mb-1">Mobile money phone number</label>
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} required disabled={awaitingConfirmation}
                            placeholder="e.g. 0712345678"
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring disabled:opacity-60" />
                    </div>
                    <button type="submit" disabled={paying || awaitingConfirmation}
                        className="bg-mango text-abyss px-4 py-2 rounded-md text-sm font-semibold hover:bg-mango-dark transition-colors disabled:opacity-60">
                        {paying ? "Sending prompt…" : awaitingConfirmation ? "Awaiting confirmation…" : `Pay ${formatMoney(verification.required_fee)}`}
                    </button>
                </form>
            )}
        </div>
    );
}

function StatusPill({ status }) {
    const map = {
        unverified: ["Not submitted", "bg-line text-ash"],
        pending: ["Pending review", "bg-azure/10 text-azure-deep"],
        approved: ["Approved", "bg-teal/10 text-teal"],
        rejected: ["Rejected", "bg-coral/10 text-coral"]
    };
    const [label, cls] = map[status] || map.unverified;
    return <span className={`text-xs font-medium px-2 py-1 rounded-full ${cls}`}>{label}</span>;
}
