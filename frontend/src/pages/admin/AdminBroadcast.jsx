import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import PageMeta from "../../components/PageMeta";
import { useToast } from "../../context/ToastContext";
import { formatDateTime } from "../../utils/format";

// Admin broadcast (Phase 9) - segment-targeted, multi-channel messaging
// on top of the existing email (config/brevo.js) and SMS/WhatsApp
// provider infra. See backend/src/modules/broadcast for the
// segment-resolution and send logic this page drives.

const SEGMENTS = [
    { value: "all_buyers", label: "All buyers" },
    { value: "all_sellers", label: "All sellers" },
    { value: "all_delivery_agents", label: "All delivery agents" },
    { value: "everyone", label: "Everyone (buyers + sellers + delivery agents)" }
];

const CHANNELS = [
    { value: "email", label: "Email" },
    { value: "sms", label: "SMS" },
    { value: "whatsapp", label: "WhatsApp" },
    { value: "in_app", label: "In-app" }
];

// Each selected channel gets its own visible box - an SMS reads nothing
// like an email, and a WhatsApp message can be longer/richer than an
// SMS but shouldn't carry a full email's paragraphs either - EXCEPT SMS
// and WhatsApp share one underlying text value: they're both short,
// title-less copy typically meant to say the same thing, so typing in
// either box updates both instead of making the admin write it twice.
// In-app keeps its own independent title+message (it's read as one
// line in NotificationBell.jsx, with its own optional title). Every
// box is optional - left blank, the server falls back to the shared
// `message`/`subject` above (see broadcast.service.js#resolveChannelContent).
// Keep these in sync with the server-side caps in
// backend/src/modules/broadcast/broadcast.validator.js.
const SMS_MAX = 320;
const WHATSAPP_MAX = 1000;
const IN_APP_MAX = 1000;

export default function AdminBroadcast() {
    const toast = useToast();
    const [segment, setSegment] = useState("all_buyers");
    const [channels, setChannels] = useState(["email"]);
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    // SMS and WhatsApp are two separate boxes on screen but one shared
    // value underneath - see the comment above SMS_MAX/WHATSAPP_MAX.
    const [smsWhatsappMessage, setSmsWhatsappMessage] = useState("");
    const [inAppTitle, setInAppTitle] = useState("");
    const [inAppMessage, setInAppMessage] = useState("");
    const [audience, setAudience] = useState(null);
    const [previewing, setPreviewing] = useState(false);
    const [sending, setSending] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [lastResult, setLastResult] = useState(null);
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    // Open/read a past broadcast's full content - the history list only
    // ever showed segment/date/channels/subject, even though the server
    // already returns the full message and every per-channel body. One
    // open row at a time (an id, not a Set) keeps this simple and matches
    // the accordion-style detail views elsewhere in the admin panel.
    const [openId, setOpenId] = useState(null);
    // Row-level "click once to arm, click again to confirm" - same
    // two-step pattern as the compose form's own Send button above,
    // reused here instead of a native window.confirm() popup.
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [confirmResendId, setConfirmResendId] = useState(null);
    // Separate from confirmDeleteId/confirmResendId (which track "armed,
    // waiting for the confirm click") so the right row's button - and
    // only that one - shows "Deleting…"/"Resending…" while its own
    // request is in flight, without the two actions' busy states bleeding
    // into each other on the same row.
    const [deletingId, setDeletingId] = useState(null);
    const [resendingId, setResendingId] = useState(null);

    const loadHistory = () => {
        setLoadingHistory(true);
        api.get("/admin/broadcasts").then(({ data }) => setHistory(data.data))
            .catch(() => {})
            .finally(() => setLoadingHistory(false));
    };

    useEffect(loadHistory, []);

    // Re-preview whenever the segment changes, so the "~N recipients"
    // figure never goes stale silently.
    useEffect(() => {
        setAudience(null);
        setPreviewing(true);
        api.post("/admin/broadcasts/preview", { segment })
            .then(({ data }) => setAudience(data.data))
            .catch(() => setAudience(null))
            .finally(() => setPreviewing(false));
    }, [segment]);

    const toggleChannel = (value) => {
        setChannels((prev) => (prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]));
    };

    const emailSelected = channels.includes("email");

    const handleSend = async () => {
        if (!confirming) {
            setConfirming(true);
            return;
        }

        setSending(true);
        try {
            const { data } = await api.post("/admin/broadcasts", {
                segment, channels, subject, message,
                // SMS and WhatsApp send the same underlying value (see
                // the smsWhatsappMessage state comment); each is still
                // only sent when its own channel is selected, and each
                // independently falls back to the shared message above
                // when left blank.
                smsMessage: smsWhatsappMessage.trim() || undefined,
                whatsappMessage: smsWhatsappMessage.trim() || undefined,
                inAppTitle: inAppTitle.trim() || undefined,
                inAppMessage: inAppMessage.trim() || undefined
            });
            setLastResult(data.data);
            toast?.success("Broadcast sent");
            setMessage("");
            setSubject("");
            setSmsWhatsappMessage("");
            setInAppTitle("");
            setInAppMessage("");
            setConfirming(false);
            loadHistory();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setSending(false);
        }
    };

    const canSend = channels.length > 0 && message.trim() && (!emailSelected || subject.trim());

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
            loadHistory();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setResendingId(null);
            setConfirmResendId(null);
        }
    };

    return (
        <div>
            <PageMeta title="Broadcast" noIndex />
            <h1 className="font-display text-2xl mb-6">Broadcast</h1>

            <div className="border border-line rounded-lg p-4 space-y-4 mb-8 max-w-2xl">
                <div>
                    <label htmlFor="broadcast-audience" className="block text-sm mb-1">Audience</label>
                    <select
                        id="broadcast-audience"
                        value={segment}
                        onChange={(e) => { setSegment(e.target.value); setConfirming(false); }}
                        className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper"
                    >
                        {SEGMENTS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </select>
                    <p className="text-xs text-ash mt-1">
                        {previewing ? "Estimating audience…" : audience ? `~${audience.recipientCount} recipients` : ""}
                    </p>
                </div>

                <div>
                    {/* Not a <label> - this heads a group of checkboxes rather
                        than a single control, so it's exposed via
                        aria-labelledby on the group below instead. */}
                    <span id="broadcast-channels-label" className="block text-sm mb-1">Channels</span>
                    <div role="group" aria-labelledby="broadcast-channels-label" className="flex gap-4">
                        {CHANNELS.map((c) => (
                            <label key={c.value} className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={channels.includes(c.value)}
                                    onChange={() => { toggleChannel(c.value); setConfirming(false); }}
                                />
                                {c.label}
                            </label>
                        ))}
                    </div>
                    {channels.includes("whatsapp") && (
                        <p className="text-xs text-ash mt-1">
                            Only reaches recipients who've opted into WhatsApp updates.
                        </p>
                    )}
                </div>

                {/* Email gets its own subject + body - the only channel that
                    needs a subject line and the one with the most room to
                    write, so it stays the "main" compose box and doubles as
                    the fallback body for any other channel left blank below. */}
                {emailSelected && (
                    <div className="border border-line rounded-md p-3 space-y-3 bg-sand/30">
                        <p className="text-xs font-medium text-ink">Email</p>
                        <Input
                            label="Subject"
                            value={subject}
                            onChange={(e) => { setSubject(e.target.value); setConfirming(false); }}
                            maxLength={150}
                        />
                        <Input
                            as="textarea"
                            label={channels.length > 1 ? "Email body (also the fallback for any channel left blank below)" : "Email body"}
                            id="broadcast-message"
                            value={message}
                            onChange={(e) => { setMessage(e.target.value); setConfirming(false); }}
                            maxLength={2000}
                            rows={5}
                            hint={`${message.length}/2000`}
                        />
                    </div>
                )}

                {!emailSelected && (
                    <div>
                        <label htmlFor="broadcast-message" className="block text-sm mb-1">Message</label>
                        <textarea
                            id="broadcast-message"
                            value={message}
                            onChange={(e) => { setMessage(e.target.value); setConfirming(false); }}
                            maxLength={2000}
                            rows={5}
                            className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper"
                        />
                        <p className="text-xs text-ash mt-1">
                            {message.length}/2000 · used as-is for any channel left blank below
                        </p>
                    </div>
                )}

                {/* SMS and WhatsApp are separate boxes but one shared value -
                    typing in either updates both, since they're usually the
                    same short copy - while in-app keeps its own independent
                    title+message (it's a different shape: read as one line
                    in NotificationBell.jsx, with its own optional title).
                    Leaving any of these blank just reuses the message above. */}
                {channels.includes("sms") && (
                    <div className="border border-line rounded-md p-3 space-y-1 bg-sand/30">
                        <p className="text-xs font-medium text-ink">SMS</p>
                        <Input
                            as="textarea"
                            label="SMS / WhatsApp message (optional - reuses the email/shared message above if left blank)"
                            value={smsWhatsappMessage}
                            onChange={(e) => { setSmsWhatsappMessage(e.target.value); setConfirming(false); }}
                            maxLength={SMS_MAX}
                            rows={2}
                            hint={`${smsWhatsappMessage.length}/${SMS_MAX} · long messages are split into multiple SMS segments by the gateway`}
                        />
                    </div>
                )}

                {channels.includes("whatsapp") && (
                    <div className="border border-line rounded-md p-3 space-y-1 bg-sand/30">
                        <p className="text-xs font-medium text-ink">WhatsApp</p>
                        <Input
                            as="textarea"
                            label="SMS / WhatsApp message (optional - reuses the email/shared message above if left blank)"
                            value={smsWhatsappMessage}
                            onChange={(e) => { setSmsWhatsappMessage(e.target.value); setConfirming(false); }}
                            maxLength={channels.includes("sms") ? SMS_MAX : WHATSAPP_MAX}
                            rows={3}
                            hint={`${smsWhatsappMessage.length}/${channels.includes("sms") ? SMS_MAX : WHATSAPP_MAX}${channels.includes("sms") ? " · shared with the SMS box above" : ""} · only reaches recipients who've opted into WhatsApp updates`}
                        />
                    </div>
                )}

                {channels.includes("in_app") && (
                    <div className="border border-line rounded-md p-3 space-y-3 bg-sand/30">
                        <p className="text-xs font-medium text-ink">In-app notification</p>
                        <Input
                            label="Title (optional - reuses the email subject, or 'Announcement', if left blank)"
                            value={inAppTitle}
                            onChange={(e) => { setInAppTitle(e.target.value); setConfirming(false); }}
                            maxLength={150}
                        />
                        <Input
                            as="textarea"
                            label="Message (optional - reuses the email/shared message above if left blank)"
                            value={inAppMessage}
                            onChange={(e) => { setInAppMessage(e.target.value); setConfirming(false); }}
                            maxLength={IN_APP_MAX}
                            rows={2}
                            hint={`${inAppMessage.length}/${IN_APP_MAX} · shown in the notification bell, so keep it short`}
                        />
                    </div>
                )}

                <Button onClick={handleSend} disabled={!canSend || sending} variant={confirming ? "primary" : "secondary"}>
                    {sending
                        ? "Sending…"
                        : confirming
                            ? `Confirm - send to ~${audience?.recipientCount ?? "?"} recipients`
                            : "Send broadcast"}
                </Button>
                {confirming && (
                    <button type="button" onClick={() => setConfirming(false)} className="ml-3 text-sm text-ash underline">
                        Cancel
                    </button>
                )}

                {lastResult && (
                    <p className="text-xs text-teal">
                        Sent to {lastResult.recipientCount} recipients
                        (email {lastResult.emailSentCount}, sms {lastResult.smsSentCount}, whatsapp {lastResult.whatsappSentCount}, in-app {lastResult.inAppSentCount}).
                    </p>
                )}
            </div>

            <h2 className="font-display text-lg mb-3">History</h2>
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
                        return (
                            <li key={b.id} className="py-3 text-sm">
                                <button
                                    type="button"
                                    onClick={() => toggleOpen(b.id)}
                                    aria-expanded={isOpen}
                                    className="w-full text-left"
                                >
                                    <div className="flex justify-between items-start gap-3">
                                        <span className="font-medium capitalize">{b.segment.replace(/_/g, " ")}</span>
                                        <span className="text-ash text-xs shrink-0">{formatDateTime(b.created_at)}</span>
                                    </div>
                                    <p className="text-ash text-xs mt-0.5">
                                        {b.channels} · {b.recipient_count} recipients · by {b.admin_first_name} {b.admin_last_name}
                                    </p>
                                    {b.subject && <p className="text-xs mt-0.5">Subject: {b.subject}</p>}
                                    <span className="text-xs text-teal mt-1 inline-block">{isOpen ? "Hide full message ↑" : "Open full message ↓"}</span>
                                </button>

                                {/* Full stored content, shown whole - no fixed-height
                                    scroller - since that's exactly what the admin
                                    clicked "Open" to read. Only channels that were
                                    actually part of this send (or got their own
                                    override body) are shown. */}
                                {isOpen && (
                                    <div className="mt-2 border border-line rounded-md p-3 bg-sand/30 space-y-3">
                                        {/* One block per channel this broadcast actually
                                            went out on, each falling back to the shared
                                            `message` exactly the way resolveChannelContent()
                                            did at send time - so what's shown here always
                                            matches what recipients actually received, even
                                            when a channel's own box was left blank. */}
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
                                                        {b.in_app_title && <p className="text-xs text-ash mb-1">Title: {b.in_app_title}</p>}
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
