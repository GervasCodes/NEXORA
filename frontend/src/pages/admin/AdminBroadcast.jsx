import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import PageMeta from "../../components/PageMeta";
import { useToast } from "../../context/ToastContext";
import { formatDateTime } from "../../utils/format";
import { smsInfo } from "../../utils/smsLength";

// Admin broadcast - segment-targeted messaging on top of the existing
// email (config/brevo.js) and SMS/WhatsApp provider infra. See
// backend/src/modules/broadcast for the segment-resolution and send logic.
//
// Round 5 Phase 4: three completely separate functions, one tab each, each
// with its own state, validation, preview and send button, and with its
// channels locked:
//   1. All channels      - subject + one message -> email, SMS, WhatsApp, in-app
//   2. WhatsApp + SMS    - one plain text, no subject
//   3. Email + in-app    - subject + rich body, optional short in-app text
// All three stay mounted (inactive ones are hidden) so a half-written draft
// survives switching tabs.

const SEGMENTS = [
    { value: "all_buyers", label: "All buyers" },
    { value: "all_sellers", label: "All sellers" },
    { value: "all_delivery_agents", label: "All delivery agents" },
    { value: "everyone", label: "Everyone (buyers + sellers + delivery agents)" }
];

const TYPES = [
    { value: "all", label: "All channels", channels: ["email", "sms", "whatsapp", "in_app"], hint: "Email, SMS, WhatsApp and in-app from one subject and one message." },
    { value: "messaging", label: "WhatsApp + SMS", channels: ["whatsapp", "sms"], hint: "One plain text on WhatsApp and SMS only. Never touches email or in-app." },
    { value: "rich", label: "Email + in-app", channels: ["email", "in_app"], hint: "A subject and a longer email body, plus a short in-app notification. Never touches SMS or WhatsApp." }
];

const TYPE_LABELS = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

// Keep these in sync with backend/src/constants/broadcast.js and
// backend/src/modules/broadcast/broadcast.validator.js.
const SUBJECT_MAX = 150;
const MESSAGE_MAX = 2000;
const MESSAGING_MAX = 1000;
const IN_APP_MAX = 1000;

// Same trimming the server applies when a body is reused as the in-app text.
const trimForInApp = (text) => {
    const value = (text || "").trim();
    return value.length > IN_APP_MAX ? `${value.slice(0, IN_APP_MAX - 1).trimEnd()}…` : value;
};

// "~N recipients" for a segment, re-estimated whenever the segment changes.
function useAudience(segment) {
    const [audience, setAudience] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setAudience(null);
        setLoading(true);
        api.post("/admin/broadcasts/preview", { segment })
            .then(({ data }) => { if (!cancelled) setAudience(data.data); })
            .catch(() => { if (!cancelled) setAudience(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [segment]);

    return { audience, loading };
}

function AudienceField({ id, segment, onChange, audience, loading }) {
    return (
        <div>
            <label htmlFor={id} className="block text-sm mb-1">Audience</label>
            <select
                id={id}
                value={segment}
                onChange={(e) => onChange(e.target.value)}
                className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper"
            >
                {SEGMENTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                ))}
            </select>
            <p className="text-xs text-ash mt-1">
                {loading ? "Estimating audience…" : audience ? `~${audience.recipientCount} recipients` : ""}
            </p>
        </div>
    );
}

function ChannelPills({ channels }) {
    return (
        <p className="text-xs text-ash">
            Channels (fixed):{" "}
            {channels.map((c) => (
                <span key={c} className="inline-block border border-line rounded-full px-2 py-0.5 mr-1 text-ink">
                    {{ email: "Email", sms: "SMS", whatsapp: "WhatsApp", in_app: "In-app" }[c]}
                </span>
            ))}
        </p>
    );
}

function SmsCounter({ text }) {
    const info = smsInfo(text);
    const multi = info.segments > 1;
    return (
        <p className={`text-xs mt-1 ${multi ? "text-coral" : "text-ash"}`}>
            SMS: {info.units} {info.encoding === "GSM-7" ? "characters" : "units (Unicode)"} · {info.segments} segment{info.segments === 1 ? "" : "s"}
            {multi ? ` - this spans more than one SMS (${info.perSegment} per part); each part is billed separately.` : ""}
            {info.encoding === "Unicode" && text ? " Emoji or special letters make SMS shorter (70 per segment)." : ""}
        </p>
    );
}

function PreviewBox({ title, children }) {
    return (
        <div className="border border-line rounded-md p-3 bg-sand/30">
            <p className="text-xs font-medium text-ink mb-1">{title}</p>
            {children}
        </div>
    );
}

// The two-step "click once to arm, click again to confirm" send button every
// tab uses, with the list of what is still missing.
function SendBar({ missing, sending, confirming, recipients, onSend, onCancel, lastResult }) {
    return (
        <div className="space-y-2">
            {missing.length > 0 && (
                <p className="text-xs text-ash">Still needed: {missing.join(", ")}.</p>
            )}
            <div>
                <Button onClick={onSend} disabled={missing.length > 0 || sending} variant={confirming ? "primary" : "secondary"}>
                    {sending
                        ? "Sending…"
                        : confirming
                            ? `Confirm - send to ~${recipients ?? "?"} recipients`
                            : "Send broadcast"}
                </Button>
                {confirming && (
                    <button type="button" onClick={onCancel} className="ml-3 text-sm text-ash underline">
                        Cancel
                    </button>
                )}
            </div>
            {lastResult && (
                <p className="text-xs text-teal">
                    Sent to {lastResult.recipientCount} recipients
                    (email {lastResult.emailSentCount}, sms {lastResult.smsSentCount}, whatsapp {lastResult.whatsappSentCount}, in-app {lastResult.inAppSentCount}).
                </p>
            )}
        </div>
    );
}

// Send/confirm state machine shared by the three tabs (each tab still owns
// its own instance, so nothing is shared between them).
function useSender({ templateType, buildPayload, onSent, reset }) {
    const toast = useToast();
    const [sending, setSending] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [lastResult, setLastResult] = useState(null);

    const send = async () => {
        if (!confirming) {
            setConfirming(true);
            return;
        }
        setSending(true);
        try {
            const { data } = await api.post("/admin/broadcasts", { templateType, ...buildPayload() });
            setLastResult(data.data);
            toast?.success("Broadcast sent");
            reset();
            setConfirming(false);
            onSent();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setSending(false);
        }
    };

    return { sending, confirming, setConfirming, lastResult, send };
}

// ---------- 1. All channels ----------
function AllChannelsTab({ onSent }) {
    const type = TYPES[0];
    const [segment, setSegment] = useState("all_buyers");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const { audience, loading } = useAudience(segment);

    const sender = useSender({
        templateType: "all",
        buildPayload: () => ({ segment, channels: type.channels, subject: subject.trim(), message: message.trim() }),
        onSent,
        reset: () => { setSubject(""); setMessage(""); }
    });
    const edit = (setter) => (e) => { setter(e.target.value); sender.setConfirming(false); };

    const missing = [];
    if (!subject.trim()) missing.push("a subject");
    if (!message.trim()) missing.push("a message");

    const inAppText = trimForInApp(message);

    return (
        <div className="space-y-4">
            <p className="text-sm text-ash">{type.hint}</p>
            <AudienceField id="bc-all-audience" segment={segment} onChange={(v) => { setSegment(v); sender.setConfirming(false); }} audience={audience} loading={loading} />
            <ChannelPills channels={type.channels} />

            <Input label="Subject (also the in-app title)" value={subject} onChange={edit(setSubject)} maxLength={SUBJECT_MAX} />
            <div>
                <Input
                    as="textarea"
                    label="Message (sent as-is on every channel)"
                    id="bc-all-message"
                    value={message}
                    onChange={edit(setMessage)}
                    maxLength={MESSAGE_MAX}
                    rows={5}
                    hint={`${message.length}/${MESSAGE_MAX} · WhatsApp only reaches people who opted into WhatsApp updates`}
                />
                <SmsCounter text={message} />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
                <PreviewBox title="Email">
                    <p className="text-xs text-ash">Subject: {subject || "-"}</p>
                    <p className="text-sm whitespace-pre-wrap">{message || "-"}</p>
                </PreviewBox>
                <PreviewBox title="SMS / WhatsApp">
                    <p className="text-sm whitespace-pre-wrap">{message || "-"}</p>
                </PreviewBox>
                <PreviewBox title="In-app notification">
                    <p className="text-xs text-ash">Title: {subject || "-"}</p>
                    <p className="text-sm whitespace-pre-wrap">{inAppText || "-"}</p>
                    {message.trim().length > IN_APP_MAX && (
                        <p className="text-xs text-coral mt-1">Trimmed to {IN_APP_MAX} characters for the notification bell.</p>
                    )}
                </PreviewBox>
            </div>

            <SendBar
                missing={missing} sending={sender.sending} confirming={sender.confirming}
                recipients={audience?.recipientCount} onSend={sender.send}
                onCancel={() => sender.setConfirming(false)} lastResult={sender.lastResult}
            />
        </div>
    );
}

// ---------- 2. WhatsApp + SMS only ----------
function MessagingTab({ onSent }) {
    const type = TYPES[1];
    const [segment, setSegment] = useState("all_buyers");
    const [message, setMessage] = useState("");
    const { audience, loading } = useAudience(segment);

    const sender = useSender({
        templateType: "messaging",
        buildPayload: () => ({ segment, channels: type.channels, message: message.trim() }),
        onSent,
        reset: () => setMessage("")
    });

    const missing = [];
    if (!message.trim()) missing.push("a message");

    return (
        <div className="space-y-4">
            <p className="text-sm text-ash">{type.hint}</p>
            <AudienceField id="bc-msg-audience" segment={segment} onChange={(v) => { setSegment(v); sender.setConfirming(false); }} audience={audience} loading={loading} />
            <ChannelPills channels={type.channels} />

            <div>
                <Input
                    as="textarea"
                    label="Message (plain text, no subject)"
                    id="bc-msg-message"
                    value={message}
                    onChange={(e) => { setMessage(e.target.value); sender.setConfirming(false); }}
                    maxLength={MESSAGING_MAX}
                    rows={4}
                    hint={`${message.length}/${MESSAGING_MAX} · WhatsApp only reaches people who opted into WhatsApp updates`}
                />
                <SmsCounter text={message} />
            </div>

            <PreviewBox title="WhatsApp and SMS (identical text)">
                <p className="text-sm whitespace-pre-wrap">{message || "-"}</p>
            </PreviewBox>

            <SendBar
                missing={missing} sending={sender.sending} confirming={sender.confirming}
                recipients={audience?.recipientCount} onSend={sender.send}
                onCancel={() => sender.setConfirming(false)} lastResult={sender.lastResult}
            />
        </div>
    );
}

// ---------- 3. Email + in-app only ----------
function RichTab({ onSent }) {
    const type = TYPES[2];
    const [segment, setSegment] = useState("all_buyers");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [inAppText, setInAppText] = useState("");
    const { audience, loading } = useAudience(segment);

    const sender = useSender({
        templateType: "rich",
        buildPayload: () => ({
            segment, channels: type.channels, subject: subject.trim(), message: body.trim(),
            inAppMessage: inAppText.trim() || undefined
        }),
        onSent,
        reset: () => { setSubject(""); setBody(""); setInAppText(""); }
    });
    const edit = (setter) => (e) => { setter(e.target.value); sender.setConfirming(false); };

    const missing = [];
    if (!subject.trim()) missing.push("a subject");
    if (!body.trim()) missing.push("an email body");

    const inAppPreview = inAppText.trim() ? inAppText.trim() : trimForInApp(body);

    return (
        <div className="space-y-4">
            <p className="text-sm text-ash">{type.hint}</p>
            <AudienceField id="bc-rich-audience" segment={segment} onChange={(v) => { setSegment(v); sender.setConfirming(false); }} audience={audience} loading={loading} />
            <ChannelPills channels={type.channels} />

            <div className="border border-line rounded-md p-3 space-y-3 bg-sand/30">
                <p className="text-xs font-medium text-ink">Email</p>
                <Input label="Subject (also the in-app title)" value={subject} onChange={edit(setSubject)} maxLength={SUBJECT_MAX} />
                <Input
                    as="textarea"
                    label="Email body (blank line starts a new paragraph)"
                    id="bc-rich-body"
                    value={body}
                    onChange={edit(setBody)}
                    maxLength={MESSAGE_MAX}
                    rows={8}
                    hint={`${body.length}/${MESSAGE_MAX}`}
                />
            </div>

            <div className="border border-line rounded-md p-3 space-y-3 bg-sand/30">
                <p className="text-xs font-medium text-ink">In-app notification</p>
                <Input
                    as="textarea"
                    label="Short in-app text (optional - uses a trimmed copy of the email body if left blank)"
                    id="bc-rich-inapp"
                    value={inAppText}
                    onChange={edit(setInAppText)}
                    maxLength={IN_APP_MAX}
                    rows={2}
                    hint={`${inAppText.length}/${IN_APP_MAX} · shown in the notification bell, so keep it short`}
                />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
                <PreviewBox title="Email">
                    <p className="text-xs text-ash">Subject: {subject || "-"}</p>
                    <p className="text-sm whitespace-pre-wrap">{body || "-"}</p>
                </PreviewBox>
                <PreviewBox title="In-app notification">
                    <p className="text-xs text-ash">Title: {subject || "-"}</p>
                    <p className="text-sm whitespace-pre-wrap">{inAppPreview || "-"}</p>
                </PreviewBox>
            </div>

            <SendBar
                missing={missing} sending={sender.sending} confirming={sender.confirming}
                recipients={audience?.recipientCount} onSend={sender.send}
                onCancel={() => sender.setConfirming(false)} lastResult={sender.lastResult}
            />
        </div>
    );
}

// ---------- History ----------
function History({ refreshKey }) {
    const toast = useToast();
    const [type, setType] = useState("");
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    // Open/read a past broadcast's full content. One open row at a time.
    const [openId, setOpenId] = useState(null);
    // Row-level "click once to arm, click again to confirm".
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [confirmResendId, setConfirmResendId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [resendingId, setResendingId] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoadingHistory(true);
        api.get("/admin/broadcasts", { params: type ? { type } : undefined })
            .then(({ data }) => { if (!cancelled) setHistory(data.data); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoadingHistory(false); });
        return () => { cancelled = true; };
    }, [type, refreshKey, reloadKey]);

    const toggleOpen = (id) => setOpenId((prev) => (prev === id ? null : id));

    const handleDelete = async (id) => {
        if (confirmDeleteId !== id) {
            setConfirmDeleteId(id);
            setConfirmResendId(null);
            return;
        }
        setDeletingId(id);
        try {
            await api.delete(`/admin/broadcasts/${id}`);
            setHistory((prev) => prev.filter((b) => b.id !== id));
            if (openId === id) setOpenId(null);
            toast?.success("Broadcast removed");
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setDeletingId(null);
            setConfirmDeleteId(null);
        }
    };

    const handleResend = async (id) => {
        if (confirmResendId !== id) {
            setConfirmResendId(id);
            setConfirmDeleteId(null);
            return;
        }
        setResendingId(id);
        try {
            const { data } = await api.post(`/admin/broadcasts/${id}/resend`);
            toast?.success(`Resent to ${data.data.recipientCount} recipients`);
            setReloadKey((k) => k + 1);
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setResendingId(null);
            setConfirmResendId(null);
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="font-display text-lg">History</h2>
                <div className="flex items-center gap-2">
                    <label htmlFor="bc-history-type" className="text-xs text-ash">Type</label>
                    <select
                        id="bc-history-type"
                        value={type}
                        onChange={(e) => { setType(e.target.value); setOpenId(null); }}
                        className="border border-line rounded-md px-2 py-1 text-sm focus-ring bg-paper"
                    >
                        <option value="">All types</option>
                        {TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {loadingHistory ? (
                <p className="text-sm text-ash">Loading…</p>
            ) : history.length === 0 ? (
                <p className="text-sm text-ash">No broadcasts sent yet.</p>
            ) : (
                <ul className="divide-y divide-line border-y border-line">
                    {history.map((b) => {
                        const isOpen = openId === b.id;
                        const isDeleting = deletingId === b.id;
                        const isResending = resendingId === b.id;
                        // Rows from before migration 149 have no/old type: they are 'all'.
                        const typeLabel = TYPE_LABELS[b.template_type] || TYPE_LABELS.all;
                        return (
                            <li key={b.id} className="py-3 text-sm">
                                <button
                                    type="button"
                                    onClick={() => toggleOpen(b.id)}
                                    aria-expanded={isOpen}
                                    className="w-full text-left"
                                >
                                    <div className="flex justify-between items-start gap-3">
                                        <span className="font-medium capitalize">
                                            {b.segment.replace(/_/g, " ")}
                                            <span className="ml-2 text-xs font-normal normal-case border border-line rounded-full px-2 py-0.5 text-ash">{typeLabel}</span>
                                        </span>
                                        <span className="text-ash text-xs shrink-0">{formatDateTime(b.created_at)}</span>
                                    </div>
                                    <p className="text-ash text-xs mt-0.5">
                                        {b.channels} · {b.recipient_count} recipients · by {b.admin_first_name} {b.admin_last_name}
                                    </p>
                                    {b.subject && <p className="text-xs mt-0.5">Subject: {b.subject}</p>}
                                    <span className="text-xs text-teal mt-1 inline-block">{isOpen ? "Hide full message ↑" : "Open full message ↓"}</span>
                                </button>

                                {/* One block per channel this broadcast actually went
                                    out on, each falling back to the shared message the
                                    way the server did at send time. */}
                                {isOpen && (
                                    <div className="mt-2 border border-line rounded-md p-3 bg-sand/30 space-y-3">
                                        {b.channels.split(",").map((channel) => {
                                            if (channel === "email") {
                                                return (
                                                    <div key={channel}>
                                                        <p className="text-xs font-medium text-ink mb-1">Email</p>
                                                        {b.subject && <p className="text-xs text-ash mb-1">Subject: {b.subject}</p>}
                                                        <p className="text-sm whitespace-pre-wrap">{b.message}</p>
                                                    </div>
                                                );
                                            }
                                            if (channel === "sms") {
                                                return (
                                                    <div key={channel}>
                                                        <p className="text-xs font-medium text-ink mb-1">SMS</p>
                                                        <p className="text-sm whitespace-pre-wrap">{b.sms_message || b.message}</p>
                                                    </div>
                                                );
                                            }
                                            if (channel === "whatsapp") {
                                                return (
                                                    <div key={channel}>
                                                        <p className="text-xs font-medium text-ink mb-1">WhatsApp</p>
                                                        <p className="text-sm whitespace-pre-wrap">{b.whatsapp_message || b.message}</p>
                                                    </div>
                                                );
                                            }
                                            if (channel === "in_app") {
                                                return (
                                                    <div key={channel}>
                                                        <p className="text-xs font-medium text-ink mb-1">In-app notification</p>
                                                        {(b.in_app_title || b.subject) && <p className="text-xs text-ash mb-1">Title: {b.in_app_title || b.subject}</p>}
                                                        <p className="text-sm whitespace-pre-wrap">{b.in_app_message || b.message}</p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })}
                                        <p className="text-xs text-ash">
                                            Delivered - email {b.email_sent_count}, sms {b.sms_sent_count}, whatsapp {b.whatsapp_sent_count}, in-app {b.in_app_sent_count}.
                                        </p>
                                    </div>
                                )}

                                <div className="flex gap-2 mt-2">
                                    <button
                                        type="button"
                                        onClick={() => handleResend(b.id)}
                                        disabled={isDeleting || isResending}
                                        className="text-xs border border-line px-3 py-1.5 rounded-md hover:border-ink disabled:opacity-50"
                                    >
                                        {isResending
                                            ? "Resending…"
                                            : confirmResendId === b.id
                                                ? `Confirm - resend to today's ${b.segment.replace(/_/g, " ")}`
                                                : "Resend"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(b.id)}
                                        disabled={isDeleting || isResending}
                                        className="text-xs border border-coral text-coral px-3 py-1.5 rounded-md hover:bg-coral/10 disabled:opacity-50"
                                    >
                                        {isDeleting
                                            ? "Deleting…"
                                            : confirmDeleteId === b.id
                                                ? "Confirm delete"
                                                : "Delete"}
                                    </button>
                                    {(confirmDeleteId === b.id || confirmResendId === b.id) && (
                                        <button
                                            type="button"
                                            onClick={() => { setConfirmDeleteId(null); setConfirmResendId(null); }}
                                            className="text-xs text-ash underline"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

export default function AdminBroadcast() {
    const [tab, setTab] = useState("all");
    // Bumped by a tab after a successful send so History reloads.
    const [refreshKey, setRefreshKey] = useState(0);
    const onSent = () => setRefreshKey((k) => k + 1);

    return (
        <div>
            <PageMeta title="Broadcast" noIndex />
            <h1 className="font-display text-2xl mb-6">Broadcast</h1>

            <div role="tablist" aria-label="Broadcast type" className="flex gap-1 mb-4 border-b border-line max-w-2xl">
                {TYPES.map((t) => (
                    <button
                        key={t.value}
                        type="button"
                        role="tab"
                        id={`bc-tab-${t.value}`}
                        aria-selected={tab === t.value}
                        aria-controls={`bc-panel-${t.value}`}
                        onClick={() => setTab(t.value)}
                        className={`px-3 py-2 text-sm -mb-px border-b-2 focus-ring ${
                            tab === t.value ? "border-ink text-ink font-medium" : "border-transparent text-ash hover:text-ink"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="border border-line rounded-lg p-4 mb-8 max-w-2xl">
                <div role="tabpanel" id="bc-panel-all" aria-labelledby="bc-tab-all" hidden={tab !== "all"}>
                    <AllChannelsTab onSent={onSent} />
                </div>
                <div role="tabpanel" id="bc-panel-messaging" aria-labelledby="bc-tab-messaging" hidden={tab !== "messaging"}>
                    <MessagingTab onSent={onSent} />
                </div>
                <div role="tabpanel" id="bc-panel-rich" aria-labelledby="bc-tab-rich" hidden={tab !== "rich"}>
                    <RichTab onSent={onSent} />
                </div>
            </div>

            <History refreshKey={refreshKey} />
        </div>
    );
}
