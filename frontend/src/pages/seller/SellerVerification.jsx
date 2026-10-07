import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import Skeleton from "../../components/Skeleton";
import ErrorState from "../../components/ui/ErrorState";
import { formatDate } from "../../utils/format";
import { convertImageFilesToPdf } from "../../utils/imageToPdf";

// Matches uploadDocument.middleware.js (8 MB). Checked after the photo
// has been converted, since that is the file that actually gets sent.
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

const formatSize = (bytes) =>
    bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

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
    const [converting, setConverting] = useState({});
    const [fieldErrors, setFieldErrors] = useState({});
    const [loadError, setLoadError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const load = () => {
        setLoading(true);
        setLoadError("");
        api.get("/seller/business-verification")
            .then(({ data }) => setStatus(data.data))
            .catch((err) => setLoadError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const setFieldError = (field, msg) => setFieldErrors((prev) => ({ ...prev, [field]: msg }));

    // Sellers can pick a PDF, or snap/choose one or more photos (e.g. a
    // multi-page certificate). Photos are turned into a single PDF here in
    // the browser, because the server only stores business documents as PDF.
    const onFile = (field, label) => async (e) => {
        const picked = Array.from(e.target.files || []);
        e.target.value = "";
        if (picked.length === 0) return;

        setFieldError(field, "");
        setError("");

        const pdfs = picked.filter((f) => f.type === "application/pdf");
        const images = picked.filter((f) => f.type.startsWith("image/"));

        if (pdfs.length + images.length !== picked.length) {
            setFieldError(field, `Your ${label} must be a PDF or a photo.`);
            return;
        }
        if (pdfs.length > 0 && picked.length > 1) {
            setFieldError(field, "Choose either one PDF, or one or more photos - not a mix.");
            return;
        }

        let result = pdfs[0] || null;
        let fromPhotos = false;
        if (!result) {
            setConverting((prev) => ({ ...prev, [field]: true }));
            try {
                result = await convertImageFilesToPdf(images);
                fromPhotos = true;
            } catch {
                setFieldError(field, "We couldn't read that photo. Try retaking it or choose a PDF.");
                return;
            } finally {
                setConverting((prev) => ({ ...prev, [field]: false }));
            }
        }

        if (!result || result.type !== "application/pdf") {
            setFieldError(field, `We couldn't turn your ${label} into a PDF. Try a PDF file instead.`);
            return;
        }
        if (result.size > MAX_DOCUMENT_BYTES) {
            setFieldError(field, `That file is ${formatSize(result.size)} - the limit is 8 MB. Try a smaller scan or fewer photos.`);
            return;
        }
        setFiles((prev) => ({ ...prev, [field]: { file: result, fromPhotos, pages: images.length } }));
    };

    const clearFile = (field) => {
        setFiles((prev) => ({ ...prev, [field]: null }));
        setFieldError(field, "");
    };

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        setMessage("");

        for (const doc of DOCUMENTS) {
            if (converting[doc.field]) {
                setError("Please wait - your photos are still being converted.");
                return;
            }
            const file = files[doc.field]?.file;
            if (!file) {
                setError(`Please upload your ${doc.label}.`);
                return;
            }
            if (file.type !== "application/pdf") {
                setError(`Your ${doc.label} must be a PDF.`);
                return;
            }
        }

        const formData = new FormData();
        DOCUMENTS.forEach((doc) => formData.append(doc.field, files[doc.field].file));

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

    if (loading) {
        return (
            <div className="animate-fade-in" aria-busy="true" aria-label="Loading verification">
                <Skeleton className="h-7 w-36 mb-2" />
                <Skeleton className="h-4 w-72 mb-8" />
                <div className="grid sm:grid-cols-2 gap-4">
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                </div>
            </div>
        );
    }

    if (loadError) return <ErrorState title="Couldn't load verification" hint={loadError} onRetry={load} />;

    const anyConverting = Object.values(converting).some(Boolean);
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
                        Upload each document as a PDF, or take a photo - we&apos;ll turn photos into a
                        PDF on your device before sending. For a multi-page document, select all the
                        pages at once.
                    </p>

                    {DOCUMENTS.map((doc) => {
                        const picked = files[doc.field];
                        return (
                            <div key={doc.field}>
                                <p className="block text-sm mb-1">{doc.label}</p>

                                {picked ? (
                                    <div className="flex items-center justify-between gap-3 border border-line rounded-md px-3 py-2 bg-paper">
                                        <div className="min-w-0">
                                            <p className="text-sm truncate">{picked.file.name}</p>
                                            <p className="text-xs text-ash">
                                                PDF · {formatSize(picked.file.size)}
                                                {picked.fromPhotos && ` · made from ${picked.pages} photo${picked.pages === 1 ? "" : "s"}`}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => clearFile(doc.field)}
                                            disabled={submitting}
                                            className="text-xs text-ash underline hover:text-ink shrink-0"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        <label
                                            htmlFor={`kyc-${doc.field}`}
                                            className="inline-block text-xs border border-line px-3 py-2 rounded-md cursor-pointer hover:border-ink transition-colors"
                                        >
                                            {converting[doc.field] ? "Converting…" : "Choose PDF or photos"}
                                        </label>
                                        <input
                                            id={`kyc-${doc.field}`}
                                            type="file"
                                            accept="application/pdf,image/*"
                                            multiple
                                            onChange={onFile(doc.field, doc.label)}
                                            disabled={converting[doc.field] || submitting}
                                            className="sr-only"
                                        />
                                        <label
                                            htmlFor={`kyc-${doc.field}-camera`}
                                            className="inline-block text-xs border border-line px-3 py-2 rounded-md cursor-pointer hover:border-ink transition-colors"
                                        >
                                            Take a photo
                                        </label>
                                        <input
                                            id={`kyc-${doc.field}-camera`}
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={onFile(doc.field, doc.label)}
                                            disabled={converting[doc.field] || submitting}
                                            className="sr-only"
                                        />
                                    </div>
                                )}

                                <p className="text-xs text-ash mt-1">{doc.hint}</p>
                                {fieldErrors[doc.field] && (
                                    <p role="alert" className="text-xs text-coral mt-1">{fieldErrors[doc.field]}</p>
                                )}
                            </div>
                        );
                    })}

                    <button
                        type="submit"
                        disabled={submitting || anyConverting}
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
