import { useEffect, useRef, useState } from "react";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import { useCurrency } from "../context/CurrencyContext";

const TIER_LABELS = {
    tier0: "Light signup",
    tier1: "ID verified",
    tier2: "Enhanced verification"
};

export default function KycStatus() {
    const { format } = useCurrency();
    const fileInputRef = useRef(null);

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [documentType, setDocumentType] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const load = () => {
        api.get("/kyc/me")
            .then(({ data }) => setStatus(data.data))
            .catch((err) => setLoadError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const submit = async (e) => {
        e.preventDefault();
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
            setError("A document upload is required");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const formData = new FormData();
            formData.append("document", file);
            formData.append("documentType", documentType);
            formData.append("note", note);
            await api.post("/kyc/upgrade", formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            setDocumentType("");
            setNote("");
            if (fileInputRef.current) fileInputRef.current.value = "";
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <PageLoader />;
    if (loadError || !status) {
        return <div className="max-w-xl mx-auto px-6 py-24 text-center text-ash text-sm">{loadError}</div>;
    }

    const limitFor = (tier) => status.limits.find((l) => l.tier === tier);

    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Verification level" noIndex />
            {/*
              Phase 6 (New UI/UX & Imagery Additions, item 20): supporting
              imagery for the trust/verification flow, which was
              previously text-and-badge-only. No photography has been
              supplied for this, so this is an illustrated trust badge
              (an inline SVG, not a placeholder <img> - a badge/shield
              motif reads fine at any resolution and doesn't need a real
              photo shoot the way Home.jsx's hero collage or
              OnboardingTour's steps do). Flagging in case the team would
              rather commission real photography here instead.
            */}
            <div className="flex items-center gap-4 mb-6 border border-line rounded-lg p-4 bg-teal/5">
                <div className="w-14 h-14 rounded-full bg-teal/10 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-7 h-7 text-teal">
                        <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z" />
                        <path d="M9 12.5l2 2 4-4.5" />
                    </svg>
                </div>
                <div>
                    <p className="font-display text-lg mb-1">Verification level</p>
                    <p className="text-ash text-sm">
                        Higher verification tiers raise how much you can spend in a single order.
                    </p>
                </div>
            </div>

            <div className="border border-line rounded-lg p-4 mb-8">
                <p className="text-xs uppercase tracking-widest text-ash mb-1">Current tier</p>
                <p className="font-display text-xl mb-1">{TIER_LABELS[status.tier]}</p>
                {limitFor(status.tier)?.max_order_amount ? (
                    <p className="text-sm text-ash">Order limit: {format(limitFor(status.tier).max_order_amount)}</p>
                ) : (
                    <p className="text-sm text-ash">No order limit</p>
                )}
            </div>

            {status.pendingRequest ? (
                <div className="border border-line rounded-lg p-4 text-sm">
                    <p className="font-medium mb-1">Upgrade request pending review</p>
                    <p className="text-ash text-xs">Requested tier: {TIER_LABELS[status.pendingRequest.target_tier]}</p>
                </div>
            ) : status.nextTier ? (
                <form onSubmit={submit} className="space-y-4">
                    <h2 className="font-display text-lg">Upgrade to {TIER_LABELS[status.nextTier]}</h2>
                    {limitFor(status.nextTier)?.max_order_amount ? (
                        <p className="text-sm text-ash -mt-2">New order limit: {format(limitFor(status.nextTier).max_order_amount)}</p>
                    ) : (
                        <p className="text-sm text-ash -mt-2">Removes your order limit</p>
                    )}

                    <div>
                        <label htmlFor="kyc-doc-type" className="block text-sm mb-1">Document type</label>
                        <input
                            id="kyc-doc-type"
                            required
                            value={documentType}
                            onChange={(e) => setDocumentType(e.target.value)}
                            placeholder="e.g. National ID, Passport"
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        />
                    </div>

                    <div>
                        <label htmlFor="kyc-doc-file" className="block text-sm mb-1">Upload document</label>
                        <input id="kyc-doc-file" ref={fileInputRef} type="file" required className="text-sm" />
                    </div>

                    <div>
                        <label htmlFor="kyc-note" className="block text-sm mb-1">Note (optional)</label>
                        <textarea
                            id="kyc-note"
                            rows={3}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring resize-none"
                        />
                    </div>

                    {error && <p className="text-sm text-coral">{error}</p>}

                    <button
                        type="submit"
                        disabled={busy}
                        className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {busy ? "Submitting…" : "Submit for review"}
                    </button>
                </form>
            ) : (
                <p className="text-sm text-ash">You're at the highest verification tier.</p>
            )}
        </div>
    );
}
