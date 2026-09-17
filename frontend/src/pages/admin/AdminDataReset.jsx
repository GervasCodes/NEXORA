import { useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import Button from "../../components/ui/Button";
import PageMeta from "../../components/PageMeta";
import { useToast } from "../../context/ToastContext";

// Clear-data tooling (Phase 2 of the Implementation Prompt roadmap). Two
// entirely separate flows below, matching the Phase 1 decision: per-seller
// reset stays behind regular admin access, full-platform reset is gated
// behind super_admin, same as AdminManageAdmins.jsx. Both are irreversible
// hard deletes - there is no "restore" here, only a typed confirmation
// gate that mirrors the phrase the backend itself checks.

const COUNT_LABELS = {
    orders: "Orders",
    reviews: "Reviews",
    conversations: "Conversations",
    disputes: "Disputes",
    returns: "Returns",
    wallet_transactions: "Wallet ledger entries",
    buyer_wallet_transactions: "Buyer wallet ledger entries",
    withdrawal_requests: "Withdrawal requests"
};

function CountsGrid({ counts }) {
    const entries = Object.entries(counts || {}).filter(([, v]) => v !== undefined);
    if (!entries.length) return null;

    return (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
            {entries.map(([key, value]) => (
                <div key={key} className="border border-line rounded-lg px-3 py-2">
                    <dt className="text-xs text-ash">{COUNT_LABELS[key] || key}</dt>
                    <dd className="font-display text-lg">{value}</dd>
                </div>
            ))}
        </dl>
    );
}

// Shared shape for both sections below: load a preview, then require the
// exact confirmation phrase (echoed back by the preview response) before
// the destructive call is even enabled.
function ResetPanel({
    title,
    description,
    dangerNote,
    testOnly,
    onTestOnlyChange,
    onPreview,
    onExecute,
    previewing,
    executing,
    disabled
}) {
    const [preview, setPreview] = useState(null);
    const [confirmation, setConfirmation] = useState("");
    const [result, setResult] = useState(null);
    const toast = useToast();

    const runPreview = async () => {
        setResult(null);
        setConfirmation("");
        try {
            const data = await onPreview();
            setPreview(data);
        } catch (err) {
            toast?.error(extractErrorMessage(err));
            setPreview(null);
        }
    };

    const runExecute = async () => {
        if (!preview) return;
        try {
            const data = await onExecute(confirmation);
            setResult(data);
            setPreview(null);
            setConfirmation("");
            toast?.success("Data reset completed.");
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        }
    };

    const confirmationMatches = preview && confirmation.trim() === preview.confirmation_phrase;

    return (
        <div className="border border-line rounded-xl p-5">
            <h2 className="font-display text-lg mb-1">{title}</h2>
            <p className="text-sm text-ash mb-4">{description}</p>

            <label className="flex items-center gap-2 text-sm mb-4">
                <input
                    type="checkbox"
                    checked={testOnly}
                    onChange={(e) => { onTestOnlyChange(e.target.checked); setPreview(null); setResult(null); }}
                    className="rounded border-line"
                />
                Test/seed data only (recommended)
            </label>

            {!testOnly && (
                <p className="text-xs text-coral mb-4">
                    Unchecked: this will also remove real, non-test data. There is no undo.
                </p>
            )}

            <div className="flex flex-wrap gap-2 mb-4">
                <Button onClick={runPreview} disabled={disabled || previewing} variant="secondary" size="sm">
                    {previewing ? "Loading preview…" : "Preview what will be deleted"}
                </Button>
            </div>

            {preview && (
                <div className="border-t border-line pt-4">
                    <p className="text-sm font-medium">
                        {preview.total_rows} row{preview.total_rows === 1 ? "" : "s"} will be permanently deleted.
                    </p>
                    <CountsGrid counts={preview.counts} />

                    <p className="text-xs text-ash mt-4 mb-1">
                        Type <span className="font-mono font-medium text-ink">{preview.confirmation_phrase}</span> to confirm.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            placeholder={preview.confirmation_phrase}
                            className="border border-line rounded-md px-3 py-2 text-sm font-mono focus-ring flex-1"
                        />
                        <Button
                            onClick={runExecute}
                            disabled={!confirmationMatches || executing}
                            className="!bg-coral !text-frost hover:!bg-coral/90 shadow-none"
                        >
                            {executing ? "Deleting…" : "Delete permanently"}
                        </Button>
                    </div>
                </div>
            )}

            {result && (
                <div className="border-t border-line pt-4 mt-4">
                    <p className="text-sm font-medium text-teal">Done — {Object.values(result.deleted).reduce((s, n) => s + Number(n || 0), 0)} rows deleted.</p>
                    <CountsGrid counts={result.deleted} />
                </div>
            )}

            {dangerNote && <p className="text-xs text-ash mt-4">{dangerNote}</p>}
        </div>
    );
}

export default function AdminDataReset() {
    const { user } = useAuth();
    const isSuperAdmin = user?.admin_level === "super_admin";

    const [sellerId, setSellerId] = useState("");
    const [sellerTestOnly, setSellerTestOnly] = useState(true);
    const [sellerPreviewing, setSellerPreviewing] = useState(false);
    const [sellerExecuting, setSellerExecuting] = useState(false);

    const [platformTestOnly, setPlatformTestOnly] = useState(true);
    const [platformPreviewing, setPlatformPreviewing] = useState(false);
    const [platformExecuting, setPlatformExecuting] = useState(false);

    const previewSeller = async () => {
        setSellerPreviewing(true);
        try {
            const { data } = await api.get(`/admin/data-reset/seller/${sellerId}/preview`, {
                params: { test_only: sellerTestOnly }
            });
            return data.data;
        } finally {
            setSellerPreviewing(false);
        }
    };

    const executeSeller = async (confirmation) => {
        setSellerExecuting(true);
        try {
            const { data } = await api.post(`/admin/data-reset/seller/${sellerId}`, {
                test_only: sellerTestOnly,
                confirmation
            });
            return data.data;
        } finally {
            setSellerExecuting(false);
        }
    };

    const previewPlatform = async () => {
        setPlatformPreviewing(true);
        try {
            const { data } = await api.get("/admin/data-reset/platform/preview", {
                params: { test_only: platformTestOnly }
            });
            return data.data;
        } finally {
            setPlatformPreviewing(false);
        }
    };

    const executePlatform = async (confirmation) => {
        setPlatformExecuting(true);
        try {
            const { data } = await api.post("/admin/data-reset/platform", {
                test_only: platformTestOnly,
                confirmation
            });
            return data.data;
        } finally {
            setPlatformExecuting(false);
        }
    };

    return (
        <div className="max-w-3xl">
            <PageMeta title="Data Reset" noIndex />
            <h1 className="font-display text-2xl mb-1">Data reset</h1>
            <p className="text-sm text-ash mb-6">
                Permanently removes orders, reviews, chats, disputes, returns and wallet history.
                Every action here is a hard delete — there is no archive, no undo, and no recovery
                short of restoring a database backup.
            </p>

            <div className="space-y-6">
                <div className="border border-line rounded-xl p-5">
                    <h2 className="font-display text-lg mb-1">Per-seller reset</h2>
                    <p className="text-sm text-ash mb-4">Clears one seller's own data only.</p>
                    <label htmlFor="data-reset-seller-id" className="block text-xs text-ash mb-1">Seller ID</label>
                    <input
                        id="data-reset-seller-id"
                        value={sellerId}
                        onChange={(e) => setSellerId(e.target.value.replace(/\D/g, ""))}
                        placeholder="e.g. 42"
                        className="border border-line rounded-md px-3 py-2 text-sm focus-ring w-40 mb-4"
                    />
                    <ResetPanel
                        title="Reset this seller"
                        description="Deletes orders containing this seller's items, their reviews, conversations, disputes, returns and wallet ledger."
                        testOnly={sellerTestOnly}
                        onTestOnlyChange={setSellerTestOnly}
                        onPreview={previewSeller}
                        onExecute={executeSeller}
                        previewing={sellerPreviewing}
                        executing={sellerExecuting}
                        disabled={!sellerId}
                    />
                </div>

                {isSuperAdmin ? (
                    <ResetPanel
                        title="Full platform reset"
                        description="Clears the scope above across every seller and buyer platform-wide. Super admin only."
                        dangerNote="This affects the entire platform's data, not one account."
                        testOnly={platformTestOnly}
                        onTestOnlyChange={setPlatformTestOnly}
                        onPreview={previewPlatform}
                        onExecute={executePlatform}
                        previewing={platformPreviewing}
                        executing={platformExecuting}
                        disabled={false}
                    />
                ) : (
                    <div className="border border-line rounded-xl p-5">
                        <h2 className="font-display text-lg mb-1">Full platform reset</h2>
                        <p className="text-sm text-ash">Only super admins can run a platform-wide reset.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
