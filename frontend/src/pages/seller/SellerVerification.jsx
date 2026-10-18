import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import Skeleton from "../../components/Skeleton";
import ErrorState from "../../components/ui/ErrorState";
import { formatDate } from "../../utils/format";
import { convertImageFilesToPdf } from "../../utils/imageToPdf";
import { useLanguage } from "../../context/LanguageContext";

// Matches uploadDocument.middleware.js (8 MB). Checked after the photo
// has been converted, since that is the file that actually gets sent.
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

const formatSize = (bytes) =>
    bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Same three fields, same order, as the backend's BUSINESS_DOC_FIELDS.
const DOCUMENTS = [
    { field: "brela_certificate", labelKey: "seller.verification.doc.brela.label", hintKey: "seller.verification.doc.brela.hint" },
    { field: "tin_certificate", labelKey: "seller.verification.doc.tin.label", hintKey: "seller.verification.doc.tin.hint" },
    { field: "business_license", labelKey: "seller.verification.doc.license.label", hintKey: "seller.verification.doc.license.hint" }
];

export default function SellerVerification() {
    const { t } = useLanguage();
    const { profile } = useOutletContext() || {};
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
            setFieldError(field, t("seller.verification.mustBePdfOrPhoto", { label }));
            return;
        }
        if (pdfs.length > 0 && picked.length > 1) {
            setFieldError(field, t("seller.verification.noMix"));
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
                setFieldError(field, t("seller.verification.photoUnreadable"));
                return;
            } finally {
                setConverting((prev) => ({ ...prev, [field]: false }));
            }
        }

        if (!result || result.type !== "application/pdf") {
            setFieldError(field, t("seller.verification.pdfConvertFailed", { label }));
            return;
        }
        if (result.size > MAX_DOCUMENT_BYTES) {
            setFieldError(field, t("seller.verification.tooLarge", { size: formatSize(result.size) }));
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
                setError(t("seller.verification.stillConverting"));
                return;
            }
            const file = files[doc.field]?.file;
            if (!file) {
                setError(t("seller.verification.pleaseUpload", { label: t(doc.labelKey) }));
                return;
            }
            if (file.type !== "application/pdf") {
                setError(t("seller.verification.mustBePdf", { label: t(doc.labelKey) }));
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
            setMessage(t("seller.verification.submitted"));
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="animate-fade-in" aria-busy="true" aria-label={t("seller.verification.loading")}>
                <Skeleton className="h-7 w-36 mb-2" />
                <Skeleton className="h-4 w-72 mb-8" />
                <div className="grid sm:grid-cols-2 gap-4">
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                </div>
            </div>
        );
    }

    if (loadError) return <ErrorState title={t("seller.verification.loadFailed")} hint={loadError} onRetry={load} />;

    const anyConverting = Object.values(converting).some(Boolean);
    const tier = status?.verification_tier;
    const latest = status?.latest_request;
    const idApproved = tier === "id_verified" || tier === "business_verified";
    const kycApproved = tier === "business_verified";
    const graceActive = Boolean(profile?.is_verified)
        && Boolean(profile?.badge_grace_until)
        && new Date(profile.badge_grace_until) > new Date();

    return (
        <div>
            <PageMeta title={t("sellerBadge.page.title")} noIndex />
            <h1 className="font-display text-2xl mb-1">{t("sellerBadge.page.title")}</h1>
            <p className="text-ash text-sm mb-8">{t("sellerBadge.page.intro")}</p>

            <div className="grid sm:grid-cols-2 gap-4 mb-10">
                <div className="border border-line rounded-lg p-4 text-sm">
                    <p className="font-medium mb-1">{t("sellerBadge.page.idTitle")}</p>
                    <p className="text-ash mb-2">{t("sellerBadge.page.idBody")}</p>
                    <p className={idApproved ? "text-teal" : "text-ash"}>
                        {idApproved ? t("sellerBadge.page.idActive") : t("sellerBadge.page.idWaiting")}
                    </p>
                </div>

                <div className="border border-line rounded-lg p-4 text-sm">
                    <p className="font-medium mb-1">{t("verification.sellerBadge")}</p>
                    <p className="text-ash mb-2">{t("sellerBadge.page.kycBody")}</p>
                    <p className={kycApproved || graceActive ? "text-teal" : "text-ash"}>
                        {kycApproved
                            ? t("sellerBadge.page.kycActive")
                            : graceActive
                                ? t("sellerBadge.page.kycGrace", { date: formatDate(profile.badge_grace_until) })
                                : latest?.status === "pending"
                                    ? t("sellerBadge.page.kycReview")
                                    : t("sellerBadge.page.kycNone")}
                    </p>
                </div>
            </div>

            {graceActive && !kycApproved && (
                <p className="text-sm text-ash mb-4">
                    {t("sellerBadge.page.graceNote", { date: formatDate(profile.badge_grace_until) })}
                </p>
            )}

            {latest?.status === "pending" && (
                <p className="text-sm text-ash">
                    {t("seller.verification.pendingNote", { date: formatDate(latest.submitted_at) })}
                </p>
            )}

            {kycApproved && (
                <p className="text-sm text-ash">{t("sellerBadge.page.done")}</p>
            )}

            {tier === "none" && (
                <p className="text-sm text-ash">{t("sellerBadge.page.locked")}</p>
            )}

            {status?.can_apply && (
                <form onSubmit={submit} className="space-y-4 max-w-lg">
                    <h2 className="font-display text-lg">{t("sellerBadge.page.applyTitle")}</h2>

                    {latest?.status === "rejected" && (
                        <p className="text-sm text-coral">
                            {latest.rejection_reason
                                ? t("seller.verification.rejectedWithReason", { reason: latest.rejection_reason })
                                : t("seller.verification.rejected")}
                        </p>
                    )}

                    <p className="text-sm text-ash">
                        {t("seller.verification.uploadHelp")}
                    </p>

                    {DOCUMENTS.map((doc) => {
                        const picked = files[doc.field];
                        return (
                            <div key={doc.field}>
                                <p className="block text-sm mb-1">{t(doc.labelKey)}</p>

                                {picked ? (
                                    <div className="flex items-center justify-between gap-3 border border-line rounded-md px-3 py-2 bg-paper">
                                        <div className="min-w-0">
                                            <p className="text-sm truncate">{picked.file.name}</p>
                                            <p className="text-xs text-ash">
                                                PDF · {formatSize(picked.file.size)}
                                                {picked.fromPhotos && ` · ${t(picked.pages === 1 ? "seller.verification.madeFromPhotos.one" : "seller.verification.madeFromPhotos.other", { count: picked.pages })}`}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => clearFile(doc.field)}
                                            disabled={submitting}
                                            className="text-xs text-ash underline hover:text-ink shrink-0"
                                        >
                                            {t("seller.verification.remove")}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        <label
                                            htmlFor={`kyc-${doc.field}`}
                                            className="inline-block text-xs border border-line px-3 py-2 rounded-md cursor-pointer hover:border-ink transition-colors"
                                        >
                                            {converting[doc.field] ? t("seller.verification.converting") : t("seller.verification.choose")}
                                        </label>
                                        <input
                                            id={`kyc-${doc.field}`}
                                            type="file"
                                            accept="application/pdf,image/*"
                                            multiple
                                            onChange={onFile(doc.field, t(doc.labelKey))}
                                            disabled={converting[doc.field] || submitting}
                                            className="sr-only"
                                        />
                                        <label
                                            htmlFor={`kyc-${doc.field}-camera`}
                                            className="inline-block text-xs border border-line px-3 py-2 rounded-md cursor-pointer hover:border-ink transition-colors"
                                        >
                                            {t("seller.verification.takePhoto")}
                                        </label>
                                        <input
                                            id={`kyc-${doc.field}-camera`}
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={onFile(doc.field, t(doc.labelKey))}
                                            disabled={converting[doc.field] || submitting}
                                            className="sr-only"
                                        />
                                    </div>
                                )}

                                <p className="text-xs text-ash mt-1">{t(doc.hintKey)}</p>
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
                        {submitting ? t("seller.verification.submitting") : t("seller.verification.submitForReview")}
                    </button>
                </form>
            )}

            {message && <p className="text-sm text-teal mt-4">{message}</p>}
            {error && <p className="text-sm text-coral mt-4">{error}</p>}
        </div>
    );
}
