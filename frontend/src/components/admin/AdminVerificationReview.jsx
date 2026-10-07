import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../ui/EmptyState";

// Focused review screen for pending seller / delivery-agent verifications
// (Phase 8). Document on the left, the person's details and the decision on
// the right, with the queue moving forward automatically after each decision.

export const DOC_LABELS = {
    owner_photo: "Owner photo / selfie",
    national_id: "National ID",
    voter_id: "Voter ID",
    drivers_license: "Driver's license",
    brela_certificate: "BRELA certificate",
    tin_certificate: "TIN certificate",
    business_license: "Business license"
};

const ROLE_LABELS = { seller: "Seller", delivery_agent: "Delivery agent" };

// What the reviewer must confirm before Approve unlocks. Kept as data so the
// checklist and the gating logic can't drift apart.
const CHECKLIST = {
    base: [
        { key: "id_readable", label: "ID document is readable and not expired" },
        { key: "name_matches", label: "Name on the documents matches the account" },
        { key: "photo_matches", label: "Owner photo matches the ID" },
        { key: "contact_matches", label: "Phone and email match what the applicant submitted" }
    ],
    delivery_agent: [
        { key: "license_valid", label: "Driver's license is valid for the vehicle type" },
        { key: "plate_matches", label: "Vehicle plate matches the registration details" }
    ]
};

// Rejection reasons the applicant reads, so they are written as instructions
// to them. Clicking one fills the reason box; the reviewer can still edit it.
export const REJECT_TEMPLATES = [
    "The document is blurry or unreadable. Please upload a clearer photo.",
    "The document has expired. Please upload a valid one.",
    "The name on the documents does not match the account name.",
    "The owner photo does not match the ID document. Please upload a clear selfie holding your ID.",
    "A required document is missing. Please upload every document listed.",
    "The document is cropped or incomplete. Please upload the full page."
];

// Short labels for tagging an individual document as failing.
const FLAG_REASONS = ["Blurry", "Expired", "Name mismatch", "Cropped", "Wrong document"];

function checklistFor(role) {
    return role === "delivery_agent" ? [...CHECKLIST.base, ...CHECKLIST.delivery_agent] : CHECKLIST.base;
}

// Shows one verification document. The page never holds a file URL: the
// signed link comes from the same audited endpoint PrivateDocumentLink uses,
// fetched when the reviewer selects a document, not when the list loads.
function DocumentViewer({ doc }) {
    const [view, setView] = useState({ status: "idle", url: null, message: "", mode: "image" });
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);

    useEffect(() => {
        setZoom(1);
        setRotation(0);
        if (!doc || !doc.has_file) return undefined;
        let cancelled = false;
        setView({ status: "loading", url: null, message: "", mode: "image" });
        api.get(`/admin/documents/verification/${doc.id}/url`)
            .then(({ data }) => {
                if (!cancelled) setView({ status: "ready", url: data.data.url, message: "", mode: "image" });
            })
            .catch((err) => {
                if (!cancelled) setView({ status: "error", url: null, message: extractErrorMessage(err), mode: "image" });
            });
        return () => {
            cancelled = true;
        };
    }, [doc?.id, doc?.has_file]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!doc) return <p className="text-sm text-ash">No documents on this account.</p>;
    if (doc.purged) return <p className="text-sm text-ash">This document was removed under the retention policy.</p>;
    if (!doc.has_file) return <p className="text-sm text-ash">No file was uploaded for this document.</p>;
    if (view.status === "loading" || view.status === "idle") return <p className="text-sm text-ash">Loading document…</p>;
    if (view.status === "error") return <p className="text-sm text-coral">{view.message}</p>;

    const isFrame = view.mode === "frame";

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
                <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                    disabled={isFrame}
                    aria-label="Zoom out"
                    className="border border-line rounded-md px-2.5 py-1 hover:border-ink disabled:opacity-40"
                >
                    −
                </button>
                <span className="w-12 text-center price text-ash">{Math.round(zoom * 100)}%</span>
                <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
                    disabled={isFrame}
                    aria-label="Zoom in"
                    className="border border-line rounded-md px-2.5 py-1 hover:border-ink disabled:opacity-40"
                >
                    +
                </button>
                <button
                    type="button"
                    onClick={() => setZoom(1)}
                    disabled={isFrame}
                    className="border border-line rounded-md px-2.5 py-1 hover:border-ink disabled:opacity-40"
                >
                    Fit
                </button>
                <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
                <button
                    type="button"
                    onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                    disabled={isFrame}
                    aria-label="Rotate left"
                    className="border border-line rounded-md px-2.5 py-1 hover:border-ink disabled:opacity-40"
                >
                    ⟲
                </button>
                <button
                    type="button"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    disabled={isFrame}
                    aria-label="Rotate right"
                    className="border border-line rounded-md px-2.5 py-1 hover:border-ink disabled:opacity-40"
                >
                    ⟳
                </button>
                <a
                    href={view.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-teal hover:underline"
                >
                    Open in new tab ↗
                </a>
            </div>

            <div className="border border-line rounded-lg bg-line/20 overflow-auto h-[62vh] min-h-[320px]">
                {isFrame ? (
                    <iframe title={DOC_LABELS[doc.document_type] || "Document"} src={view.url} className="w-full h-full bg-paper" />
                ) : (
                    <div className="min-h-full flex items-center justify-center p-4">
                        <img
                            src={view.url}
                            alt={DOC_LABELS[doc.document_type] || "Verification document"}
                            onError={() => setView((v) => ({ ...v, mode: "frame" }))}
                            style={{
                                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                                transition: "transform 150ms ease",
                                maxWidth: zoom > 1 ? "none" : "100%",
                                maxHeight: zoom > 1 ? "none" : "100%"
                            }}
                            className="select-none"
                        />
                    </div>
                )}
            </div>
            {isFrame && (
                <p className="text-[11px] text-ash mt-2">
                    Showing the file as a PDF. Zoom and rotate are unavailable here; use Open in new tab for those.
                </p>
            )}
        </div>
    );
}

export default function AdminVerificationReview({ queue: initialQueue, onExit, onChanged }) {
    const toast = useToast();
    const [queue, setQueue] = useState(initialQueue);
    const [index, setIndex] = useState(0);
    const [detail, setDetail] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [activeDocId, setActiveDocId] = useState(null);
    const [checks, setChecks] = useState({});
    const [rejectReason, setRejectReason] = useState("");
    const [flagDraft, setFlagDraft] = useState(null); // { docId, reason }
    const [busy, setBusy] = useState(false);
    const [pendingAction, setPendingAction] = useState(null); // "approve" | "reject"
    const [processed, setProcessed] = useState(0);

    const current = queue[index] ?? null;

    // Load the full record for whichever applicant is now current. Checklist
    // and reason text are per applicant, so they reset with the record.
    useEffect(() => {
        if (!current) return undefined;
        let cancelled = false;
        setLoadingDetail(true);
        setDetail(null);
        setChecks({});
        setRejectReason("");
        setFlagDraft(null);
        api.get(`/admin/account-verifications/${current.id}`)
            .then(({ data }) => {
                if (cancelled) return;
                setDetail(data.data);
                setActiveDocId(data.data.documents[0]?.id ?? null);
            })
            .catch((err) => toast?.error(extractErrorMessage(err)))
            .finally(() => {
                if (!cancelled) setLoadingDetail(false);
            });
        return () => {
            cancelled = true;
        };
    }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const documents = detail?.documents ?? [];
    const activeDoc = documents.find((d) => d.id === activeDocId) ?? documents[0] ?? null;
    const flaggedDocs = documents.filter((d) => d.flag_reason);
    const items = detail ? checklistFor(detail.role) : [];
    const checkedCount = items.filter((i) => checks[i.key]).length;
    const approveBlockers = [];
    if (detail && documents.length === 0) approveBlockers.push("This account has no documents to check.");
    if (flaggedDocs.length > 0) approveBlockers.push("Reject, or remove the flag from, the failing document(s) first.");
    if (detail && checkedCount < items.length) approveBlockers.push(`Confirm the checklist (${checkedCount} of ${items.length}).`);
    const canApprove = !!detail && !busy && approveBlockers.length === 0;

    // Removes the decided applicant from the queue. The index is left alone
    // so the next applicant slides into the same position, which is what
    // "next in queue" means here.
    const advance = (decidedId) => {
        const nextQueue = queue.filter((r) => r.id !== decidedId);
        setQueue(nextQueue);
        setIndex((i) => Math.min(i, Math.max(0, nextQueue.length - 1)));
        setProcessed((n) => n + 1);
        onChanged?.();
    };

    const skip = () => setIndex((i) => Math.min(i + 1, queue.length - 1));

    const runDecision = async (action) => {
        if (!current) return;
        setBusy(true);
        try {
            if (action === "approve") {
                await api.put(`/admin/account-verifications/${current.id}/approve`);
                toast?.success(`Approved ${current.first_name} ${current.last_name}.`);
            } else {
                const reason = rejectReason.trim();
                await api.put(`/admin/account-verifications/${current.id}/reject`, { reason });
                toast?.success(`Rejected ${current.first_name} ${current.last_name}.`);
            }
            setPendingAction(null);
            advance(current.id);
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const saveFlag = async () => {
        if (!flagDraft?.reason?.trim()) {
            toast?.error("Pick or type a reason for the failing document.");
            return;
        }
        setBusy(true);
        try {
            const { data } = await api.put(`/admin/account-verifications/documents/${flagDraft.docId}/flag`, {
                reason: flagDraft.reason.trim()
            });
            setDetail(data.data);
            setFlagDraft(null);
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const removeFlag = async (docId) => {
        setBusy(true);
        try {
            const { data } = await api.delete(`/admin/account-verifications/documents/${docId}/flag`);
            setDetail(data.data);
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    if (!current) {
        return (
            <div className="space-y-4">
                <button type="button" onClick={onExit} className="text-xs text-teal hover:underline">
                    ← Back to list
                </button>
                <EmptyState
                    title="Queue cleared."
                    hint={processed > 0 ? `You reviewed ${processed} application${processed === 1 ? "" : "s"} in this session.` : "No pending applications."}
                />
            </div>
        );
    }

    const fullName = `${current.first_name} ${current.last_name}`;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={onExit} className="text-xs text-teal hover:underline">
                    ← Back to list
                </button>
                <p className="text-sm text-ash">
                    Applicant {index + 1} of {queue.length} pending
                    {processed > 0 && <span className="text-xs"> · {processed} decided this session</span>}
                </p>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setIndex((i) => Math.max(0, i - 1))}
                        disabled={index === 0 || busy}
                        className="text-xs border border-line px-3 py-1.5 rounded-md disabled:opacity-40"
                    >
                        Previous
                    </button>
                    <button
                        type="button"
                        onClick={skip}
                        disabled={index >= queue.length - 1 || busy}
                        className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink disabled:opacity-40"
                    >
                        Next in queue →
                    </button>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                {/* Left: documents */}
                <section className="min-w-0">
                    {documents.length > 1 && (
                        <div role="tablist" aria-label="Documents" className="flex flex-wrap gap-1.5 mb-3">
                            {documents.map((doc) => (
                                <button
                                    key={doc.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeDoc?.id === doc.id}
                                    onClick={() => setActiveDocId(doc.id)}
                                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                                        activeDoc?.id === doc.id ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"
                                    }`}
                                >
                                    {DOC_LABELS[doc.document_type] || doc.document_type}
                                    {doc.flag_reason && <span className="ml-1.5 text-coral">●</span>}
                                </button>
                            ))}
                        </div>
                    )}
                    {loadingDetail ? <p className="text-sm text-ash">Loading applicant…</p> : <DocumentViewer doc={activeDoc} />}
                </section>

                {/* Right: details, checklist, failing docs, decision */}
                <aside className="space-y-6 min-w-0">
                    <div className="border border-line rounded-lg p-4">
                        <p className="text-xs uppercase tracking-widest text-ash mb-2">Applicant</p>
                        <p className="font-medium text-sm">
                            {fullName} <span className="text-xs text-ash font-normal">({ROLE_LABELS[current.role] || current.role})</span>
                        </p>
                        <p className="text-xs text-ash break-all">{current.email}</p>
                        <p className="text-xs text-ash">{current.phone}</p>
                        <p className="text-xs text-ash mt-2">
                            Submitted {current.account_verification_submitted_at ? new Date(current.account_verification_submitted_at).toLocaleString() : "—"}
                        </p>
                        {detail?.role === "delivery_agent" && (detail.vehicle_type || detail.vehicle_plate_number) && (
                            <p className="text-sm mt-2">
                                <span className="capitalize">{detail.vehicle_type}</span>
                                {detail.vehicle_plate_number && ` · Plate ${detail.vehicle_plate_number}`}
                            </p>
                        )}
                    </div>

                    {detail && (
                        <div className="border border-line rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs uppercase tracking-widest text-ash">Checklist</p>
                                <p className="text-xs text-ash price">{checkedCount}/{items.length}</p>
                            </div>
                            <ul className="space-y-2">
                                {items.map((item) => (
                                    <li key={item.key}>
                                        <label className="flex items-start gap-2 text-sm cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={!!checks[item.key]}
                                                onChange={(e) => setChecks((c) => ({ ...c, [item.key]: e.target.checked }))}
                                                className="mt-0.5"
                                            />
                                            <span>{item.label}</span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {detail && (
                        <div className="border border-line rounded-lg p-4">
                            <p className="text-xs uppercase tracking-widest text-ash mb-3">Failing documents</p>

                            {flaggedDocs.length === 0 && !flagDraft && (
                                <p className="text-xs text-ash mb-3">No documents are tagged as failing.</p>
                            )}

                            <ul className="space-y-2 mb-3">
                                {flaggedDocs.map((doc) => (
                                    <li key={doc.id} className="text-sm flex items-start justify-between gap-2">
                                        <span className="min-w-0">
                                            <span className="text-coral">{DOC_LABELS[doc.document_type] || doc.document_type}</span>
                                            <span className="block text-xs text-ash">{doc.flag_reason}</span>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => removeFlag(doc.id)}
                                            disabled={busy}
                                            className="text-xs text-ash hover:underline shrink-0 disabled:opacity-50"
                                        >
                                            Remove
                                        </button>
                                    </li>
                                ))}
                            </ul>

                            {activeDoc && activeDoc.has_file && !activeDoc.flag_reason && !flagDraft && (
                                <button
                                    type="button"
                                    onClick={() => setFlagDraft({ docId: activeDoc.id, reason: "" })}
                                    className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-coral hover:text-coral transition-colors"
                                >
                                    Tag “{DOC_LABELS[activeDoc.document_type] || activeDoc.document_type}” as failing
                                </button>
                            )}

                            {flagDraft && (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-1.5">
                                        {FLAG_REASONS.map((r) => (
                                            <button
                                                key={r}
                                                type="button"
                                                onClick={() => setFlagDraft((d) => ({ ...d, reason: r }))}
                                                className={`text-[11px] px-2 py-1 rounded-full border ${
                                                    flagDraft.reason === r ? "bg-coral text-white border-coral" : "border-line hover:border-coral"
                                                }`}
                                            >
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                    <input
                                        value={flagDraft.reason}
                                        onChange={(e) => setFlagDraft((d) => ({ ...d, reason: e.target.value }))}
                                        placeholder="Reason"
                                        maxLength={255}
                                        aria-label="Reason this document is failing"
                                        className="w-full border border-line rounded-md px-3 py-1.5 text-sm focus-ring"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={saveFlag}
                                            disabled={busy}
                                            className="text-xs bg-coral text-white px-3 py-1.5 rounded-md disabled:opacity-50"
                                        >
                                            Save flag
                                        </button>
                                        <button type="button" onClick={() => setFlagDraft(null)} className="text-xs text-ash hover:underline">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {detail && (
                        <div className="border border-line rounded-lg p-4 space-y-3">
                            <p className="text-xs uppercase tracking-widest text-ash">Decision</p>

                            <button
                                type="button"
                                onClick={() => setPendingAction("approve")}
                                disabled={!canApprove}
                                className="w-full text-sm bg-teal text-frost px-3 py-2 rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
                            >
                                Approve
                            </button>
                            {approveBlockers.length > 0 && (
                                <ul className="text-[11px] text-ash list-disc pl-4 space-y-0.5">
                                    {approveBlockers.map((b) => (
                                        <li key={b}>{b}</li>
                                    ))}
                                </ul>
                            )}

                            <div className="pt-3 border-t border-line/60">
                                <p className="text-xs text-ash mb-2">Rejection reason (the applicant reads this)</p>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {REJECT_TEMPLATES.map((t, i) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setRejectReason(t)}
                                            title={t}
                                            className="text-[11px] px-2 py-1 rounded-full border border-line hover:border-ink"
                                        >
                                            Template {i + 1}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    rows={3}
                                    maxLength={255}
                                    placeholder="Rejection reason"
                                    aria-label="Rejection reason"
                                    className="w-full border border-line rounded-md px-3 py-1.5 text-sm focus-ring"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!rejectReason.trim()) {
                                            toast?.error("Enter a rejection reason first.");
                                            return;
                                        }
                                        setPendingAction("reject");
                                    }}
                                    disabled={busy}
                                    className="mt-2 w-full text-sm border border-coral text-coral px-3 py-2 rounded-md hover:bg-coral/10 transition-colors disabled:opacity-50"
                                >
                                    Reject
                                </button>
                            </div>
                        </div>
                    )}
                </aside>
            </div>

            <ConfirmDialog
                open={pendingAction === "approve"}
                title={`Approve ${fullName}?`}
                description="This unlocks their account for selling or delivery. You can't undo this from here."
                confirmLabel="Approve"
                onConfirm={() => runDecision("approve")}
                onCancel={() => setPendingAction(null)}
            />
            <ConfirmDialog
                open={pendingAction === "reject"}
                title={`Reject ${fullName}?`}
                description={`They will be told: "${rejectReason.trim()}"`}
                confirmLabel="Reject"
                danger
                onConfirm={() => runDecision("reject")}
                onCancel={() => setPendingAction(null)}
            />
        </div>
    );
}
