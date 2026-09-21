import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import PageLoader from "../../components/PageLoader";
import { formatDate } from "../../utils/format";

// Same three fields, same order, as the backend's BUSINESS_DOC_FIELDS.
const DOCUMENTS = [
    { field: "brela_certificate", label: "BRELA certificate", hint: "Business registration certificate issued by BRELA." },
    { field: "tin_certificate", label: "TIN certificate", hint: "Your business's TRA Taxpayer Identification Number certificate." },
    { field: "business_license", label: "Business license", hint: "Your current business license." }
];

export default function SellerVerification() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [files, setFiles] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const load = () => {
        api.get("/seller/business-verification")
            .then(({ data }) => setStatus(data.data))
            .catch((err) => setError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const onFile = (field) => (e) => setFiles({ ...files, [field]: e.target.files?.[0] || null });

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        setMessage("");

        for (const doc of DOCUMENTS) {
            const file = files[doc.field];
            if (!file) {
                setError(`Please upload your ${doc.label}.`);
                return;
            }
            if (file.type !== "application/pdf") {
                setError(`Your ${doc.label} must be uploaded as a PDF document, not a photo.`);
                return;
            }
        }

        const formData = new FormData();
        DOCUMENTS.forEach((doc) => formData.append(doc.field, files[doc.field]));

        setSubmitting(true);
        try {
            const { data } = await api.post("/seller/business-verification", formData);
            setStatus(data.data);
            setFiles({});
            setMessage("Submitted. Our team will review your documents and notify you of the outcome.");
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <PageLoader />;

    const tier = status?.verification_tier;
    const latest = status?.latest_request;

    return (
        <div>
            <PageMeta title="Verification" noIndex />
            <h1 className="font-display text-2xl mb-1">Verification</h1>
            <p className="text-ash text-sm mb-8">
                Two badges tell buyers how much of your identity NEXORA has checked.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-10">
                <div className="border border-line rounded-lg p-4 text-sm">
                    <p className="font-medium mb-1">Verified Seller</p>
                    <p className="text-ash mb-2">Your National ID or Voter ID, checked at registration. Free.</p>
                    <p className={tier === "id_verified" || tier === "business_verified" ? "text-teal" : "text-ash"}>
                        {tier === "id_verified" || tier === "business_verified" ? "Active" : "Awaiting ID verification"}
                    </p>
                </div>

                <div className="border border-line rounded-lg p-4 text-sm">
                    <p className="font-medium mb-1">Verified Business</p>
                    <p className="text-ash mb-2">Backed by your BRELA certificate, TIN certificate and business license.</p>
                    <p className={tier === "business_verified" ? "text-azure" : "text-ash"}>
                        {tier === "business_verified"
                            ? "Active"
                            : latest?.status === "pending"
                                ? "Under review"
                                : "Not verified"}
                    </p>
                </div>
            </div>

            {latest?.status === "pending" && (
                <p className="text-sm text-ash">
                    Your request was submitted {formatDate(latest.submitted_at)} and is waiting for review.
                </p>
            )}

            {tier === "business_verified" && (
                <p className="text-sm text-ash">Your business is verified. Nothing more to do here.</p>
            )}

            {tier === "none" && (
                <p className="text-sm text-ash">
                    Verified Business becomes available once your ID verification has been approved.
                </p>
            )}

            {status?.can_apply && (
                <form onSubmit={submit} className="space-y-4 max-w-lg">
                    <h2 className="font-display text-lg">Apply for Verified Business</h2>

                    {latest?.status === "rejected" && (
                        <p className="text-sm text-coral">
                            Your last request was rejected{latest.rejection_reason ? `: ${latest.rejection_reason}` : "."} You can
                            submit a new one below.
                        </p>
                    )}

                    <p className="text-sm text-ash">
                        Upload each document as a PDF. Photos of documents aren&apos;t accepted.
                    </p>

                    {DOCUMENTS.map((doc) => (
                        <div key={doc.field}>
                            <label className="block text-sm mb-1" htmlFor={`kyc-${doc.field}`}>{doc.label}</label>
                            <input
                                id={`kyc-${doc.field}`}
                                type="file"
                                accept="application/pdf"
                                required
                                onChange={onFile(doc.field)}
                                className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper"
                            />
                            <p className="text-xs text-ash mt-1">{doc.hint}</p>
                        </div>
                    ))}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {submitting ? "Submitting…" : "Submit for review"}
                    </button>
                </form>
            )}

            {message && <p className="text-sm text-teal mt-4">{message}</p>}
            {error && <p className="text-sm text-coral mt-4">{error}</p>}
        </div>
    );
}
