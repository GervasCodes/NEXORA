import { useRef, useState } from "react";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import PageState from "../components/ui/PageState";
import useFetch from "../hooks/useFetch";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";
import { convertImageFileToPdf, convertImageFilesToPdf } from "../utils/imageToPdf";

const MAX_FILE_MB = 8;

// Document type options per tier, described in buyer terms rather than
// the backend's tier0/tier1/tier2 codes (Phase 4 remediation - this was
// previously a free-text <input>, so a buyer could type anything,
// including something an admin reviewer couldn't act on). `needsBack`
// drives the front/back capture UI below.
const DOCUMENT_TYPES = {
    tier1: [
        { value: "National ID", needsBack: true },
        { value: "Voter ID", needsBack: true },
        { value: "Driver's License", needsBack: true },
        { value: "Passport", needsBack: false }
    ],
    tier2: [
        { value: "Utility bill", needsBack: false },
        { value: "Bank statement", needsBack: false },
        { value: "Tenancy agreement", needsBack: false }
    ]
};

// Buyer-facing description of what each tier unlocks, instead of the
// bare TIER_LABELS strings this page used to show on their own with no
// context (Phase 4 remediation: "describe tiers in buyer terms").
const TIER_COPY = {
    tier0: { labelKey: "kyc.tier.tier0.label", descKey: "kyc.tier.tier0.desc" },
    tier1: { labelKey: "kyc.tier.tier1.label", descKey: "kyc.tier.tier1.desc" },
    tier2: { labelKey: "kyc.tier.tier2.label", descKey: "kyc.tier.tier2.desc" }
};

function FilePicker({ id, label, file, onChange, captureHint }) {
    const inputRef = useRef(null);
    const [previewUrl, setPreviewUrl] = useState(null);

    const handleChange = (e) => {
        const f = e.target.files?.[0] || null;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
        onChange(f);
    };

    return (
        <div>
            <label htmlFor={id} className="block text-sm mb-1">{label}</label>
            <input
                id={id}
                ref={inputRef}
                type="file"
                accept="image/*,application/pdf"
                capture={captureHint}
                required
                onChange={handleChange}
                className="text-sm"
            />
            {previewUrl && (
                <img src={previewUrl} alt="" className="mt-2 h-28 rounded-md border border-line object-cover" />
            )}
            {file && !previewUrl && (
                <p className="text-xs text-ash mt-1">{file.name}</p>
            )}
        </div>
    );
}

export default function KycStatus() {
    const { format } = useCurrency();
    const { t } = useLanguage();

    // (Phase 4 remediation) - previously a `.finally(() =>
    // setLoading(false))` with the error caught but no retry affordance
    // at all; `useFetch`/`PageState` give it the same error-with-retry
    // every other page gets now.
    const { data: status, loading, error, retry } = useFetch(
        () => api.get("/kyc/me").then(({ data }) => data.data),
        []
    );

    const [documentType, setDocumentType] = useState("");
    const [frontFile, setFrontFile] = useState(null);
    const [backFile, setBackFile] = useState(null);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [converting, setConverting] = useState(false);
    const [formError, setFormError] = useState("");

    if (loading || error) {
        return (
            <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
                <PageMeta title="Verification level" noIndex />
                <PageState
                    loading={loading}
                    error={error}
                    onRetry={retry}
                    errorProps={{ title: "Couldn't load your verification status", hint: "Check your connection and try again." }}
                />
            </div>
        );
    }

    const limitFor = (tier) => status.limits.find((l) => l.tier === tier);
    const docOptions = status.nextTier ? DOCUMENT_TYPES[status.nextTier] || [] : [];
    const selectedDoc = docOptions.find((d) => d.value === documentType);

    const submit = async (e) => {
        e.preventDefault();
        if (!frontFile) {
            setFormError(t("kyc.form.documentRequired"));
            return;
        }
        if (selectedDoc?.needsBack && !backFile) {
            setFormError(t("kyc.form.backRequired"));
            return;
        }
        setBusy(true);
        setFormError("");
        try {
            // Store PDFs, not photos (Phase 4 remediation, per the
            // PDF-only decision carried over from earlier phases) - a
            // camera-captured photo is converted to PDF right here in
            // the browser before it's ever sent; front+back becomes one
            // 2-page PDF instead of two separate uploads, since the
            // upload endpoint takes a single `document` file.
            setConverting(true);
            const toUpload = selectedDoc?.needsBack
                ? await convertImageFilesToPdf([frontFile, backFile])
                : await convertImageFileToPdf(frontFile);
            setConverting(false);

            const formData = new FormData();
            formData.append("document", toUpload);
            formData.append("documentType", documentType);
            formData.append("note", note);
            await api.post("/kyc/upgrade", formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            setDocumentType("");
            setFrontFile(null);
            setBackFile(null);
            setNote("");
            retry();
        } catch (err) {
            setFormError(extractErrorMessage(err));
        } finally {
            setBusy(false);
            setConverting(false);
        }
    };

    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Verification level" noIndex />
            <div className="flex items-center gap-4 mb-6 border border-line rounded-lg p-4 bg-teal/5">
                <div className="w-14 h-14 rounded-full bg-teal/10 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-7 h-7 text-teal">
                        <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z" />
                        <path d="M9 12.5l2 2 4-4.5" />
                    </svg>
                </div>
                <div>
                    <h1 className="font-display text-lg mb-1">{t("kyc.title")}</h1>
                    <p className="text-ash text-sm">{t("kyc.subtitle")}</p>
                </div>
            </div>

            <div className="border border-line rounded-lg p-4 mb-4">
                <p className="text-xs uppercase tracking-widest text-ash mb-1">{t("kyc.currentTier")}</p>
                <p className="font-display text-xl mb-1">{t(TIER_COPY[status.tier].labelKey)}</p>
                <p className="text-sm text-ash mb-2">{t(TIER_COPY[status.tier].descKey)}</p>
                {limitFor(status.tier)?.max_order_amount ? (
                    <p className="text-sm text-ash">{t("kyc.orderLimit")}: {format(limitFor(status.tier).max_order_amount)}</p>
                ) : (
                    <p className="text-sm text-ash">{t("kyc.noOrderLimit")}</p>
                )}
            </div>

            {status.rejectedRequest && (
                <div className="border border-coral/30 bg-coral/5 rounded-lg p-4 mb-4 text-sm">
                    <p className="font-medium text-coral mb-1">{t("kyc.rejected.title")}</p>
                    <p className="text-ash text-xs mb-2">
                        {t("kyc.rejected.documentType")}: {status.rejectedRequest.document_type}
                    </p>
                    <p>{status.rejectedRequest.rejection_reason}</p>
                    <p className="text-ash text-xs mt-2">{t("kyc.rejected.hint")}</p>
                </div>
            )}

            {status.pendingRequest ? (
                <div className="border border-line rounded-lg p-4 text-sm">
                    <p className="font-medium mb-1">{t("kyc.pending.title")}</p>
                    <p className="text-ash text-xs">{t("kyc.pending.targetTier")}: {t(TIER_COPY[status.pendingRequest.target_tier].labelKey)}</p>
                </div>
            ) : status.nextTier ? (
                <form onSubmit={submit} className="space-y-4">
                    <h2 className="font-display text-lg">{t("kyc.upgradeTo")} {t(TIER_COPY[status.nextTier].labelKey)}</h2>
                    <p className="text-sm text-ash -mt-2">{t(TIER_COPY[status.nextTier].descKey)}</p>
                    {limitFor(status.nextTier)?.max_order_amount ? (
                        <p className="text-sm text-ash -mt-2">{t("kyc.newOrderLimit")}: {format(limitFor(status.nextTier).max_order_amount)}</p>
                    ) : (
                        <p className="text-sm text-ash -mt-2">{t("kyc.removesOrderLimit")}</p>
                    )}

                    <div>
                        <label htmlFor="kyc-doc-type" className="block text-sm mb-1">{t("kyc.form.documentType")}</label>
                        <select
                            id="kyc-doc-type"
                            required
                            value={documentType}
                            onChange={(e) => { setDocumentType(e.target.value); setFrontFile(null); setBackFile(null); }}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-white"
                        >
                            <option value="" disabled>{t("kyc.form.selectDocumentType")}</option>
                            {docOptions.map((d) => (
                                <option key={d.value} value={d.value}>{d.value}</option>
                            ))}
                        </select>
                    </div>

                    {documentType && (
                        <div className="space-y-3 border border-line rounded-lg p-3">
                            <FilePicker
                                id="kyc-doc-front"
                                label={selectedDoc?.needsBack ? t("kyc.form.frontSide") : t("kyc.form.document")}
                                file={frontFile}
                                onChange={setFrontFile}
                                captureHint="environment"
                            />
                            {selectedDoc?.needsBack && (
                                <FilePicker
                                    id="kyc-doc-back"
                                    label={t("kyc.form.backSide")}
                                    file={backFile}
                                    onChange={setBackFile}
                                    captureHint="environment"
                                />
                            )}
                            <p className="text-xs text-ash">{t("kyc.form.sizeHint", { size: MAX_FILE_MB })}</p>
                        </div>
                    )}

                    <div>
                        <label htmlFor="kyc-note" className="block text-sm mb-1">{t("kyc.form.note")}</label>
                        <textarea
                            id="kyc-note"
                            rows={3}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring resize-none"
                        />
                    </div>

                    {formError && <p className="text-sm text-coral">{formError}</p>}

                    <button
                        type="submit"
                        disabled={busy}
                        className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {converting ? t("kyc.form.preparing") : busy ? t("kyc.form.submitting") : t("kyc.form.submit")}
                    </button>
                </form>
            ) : (
                <p className="text-sm text-ash">{t("kyc.highestTier")}</p>
            )}
        </div>
    );
}
