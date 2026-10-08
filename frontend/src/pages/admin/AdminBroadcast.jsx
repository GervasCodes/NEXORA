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

// Templates now match how the channels actually group, instead of
// every channel getting its own box (which made admins re-type near-
// identical copy 3 times and - worse - made it easy to accidentally
// send SMS/WhatsApp/in-app the full multi-paragraph email body, since
// an untouched box silently fell back to it):
//   - Email is the only channel with a subject/title, so it keeps its
//     own dedicated box.
//   - SMS, WhatsApp and in-app are all short, title-less, read-on-a-
//     phone-or-in-a-bell copy - they now share ONE "Message" box. When
//     email is also selected this shows as a second box (so the short
//     copy doesn't just inherit the long email body); when email isn't
//     selected it's the only box on the page.
// Server-side the three still travel as independent smsMessage/
// whatsappMessage/inAppMessage fields (see broadcast.service.js) - this
// page just always sends the one shared value for all three, so a
// sent/resent broadcast still shows correctly per-channel in History
// either way.
const SMS_MAX = 320; // SMS is billed/split into segments past ~160 chars by the gateway
const SHARED_MAX = 1000; // WhatsApp/in-app headroom; shown as the shared box's cap whenever SMS isn't part of the send

export default function AdminBroadcast() {
    const toast = useToast();
    const [segment, setSegment] = useState("all_buyers");
    const [channels, setChannels] = useState(["email"]);
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    // The one shared box for SMS/WhatsApp/in-app (see the comment above
    // SMS_MAX/SHARED_MAX). Only used - and only shown - when email is
    // ALSO selected, since otherwise `message` above already IS that
    // shared content (see the rendering below and handleSend()).
    const [sharedMessage, setSharedMessage] = useState("");
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
    const otherChannelsSelected = channels.includes("sms") || channels.includes("whatsapp") || channels.includes("in_app");

    // When email is selected, `message` is purely the email body and
    // `sharedMessage` carries the SMS/WhatsApp/in-app copy. When email
    // is NOT selected, there's only one box on the page (bound to
    // `message`) and it directly IS that shared copy - so this is the
    // one place that decides which state holds "what SMS/WhatsApp/
    // in-app actually get", instead of that logic being duplicated
    // between the render and the submit handler.
    const effectiveSharedMessage = emailSelected ? sharedMessage : message;

    const handleSend = async () => {
        if (!confirming) {
            setConfirming(true);
            return;
        }

        setSending(true);
        try {
            const { data } = await api.post("/admin/broadcasts", {
                segment, channels,
                subject: emailSelected ? subject : undefined,
                message,
                // All three travel as the same shared copy - see the
                // SMS_MAX/SHARED_MAX comment above for why they're no
                // longer separately-typed boxes. Each is only sent when
                // its own channel is actually selected (not just "some
                // other channel is"), so a broadcast's stored history
                // never carries an override for a channel it didn't go
                // out on. inAppTitle is left unset on purpose: the
                // server already falls back to the email subject, or
                // "Announcement", which is the right default now that
                // there's no dedicated in-app title field to fill in.
                smsMessage: channels.includes("sms") ? effectiveSharedMessage : undefined,
                whatsappMessage: channels.includes("whatsapp") ? effectiveSharedMessage : undefined,
                inAppMessage: channels.includes("in_app") ? effectiveSharedMessage : undefined
            });
            setLastResult(data.data);
            toast?.success("Broadcast sent");
            setMessage("");
            setSubject("");
            setSharedMessage("");
            setConfirming(false);
            loadHistory();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setSending(false);
        }
    };

    const canSend = channels.length > 0
        && (!emailSelected || (subject.trim() && message.trim()))
        && (!otherChannelsSelected || effectiveSharedMessage.trim());

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

                {/* Email is the only channel with a subject line, so it keeps
                    its own dedicated box. When other channels are also
                    selected, this is purely the email's content now - it no
                    longer doubles as the fallback body for SMS/WhatsApp/
                    in-app (see the shared "Message" box below instead). */}
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
                            label="Email body"
                            id="broadcast-message"
                            value={message}
                            onChange={(e) => { setMessage(e.target.value); setConfirming(false); }}
                            maxLength={2000}
                            rows={5}
                            hint={`${message.length}/2000`}
                        />
                    </div>
                )}

                {/* SMS, WhatsApp and in-app share one template: none of them
                    has a subject/title, and none should be sent the full
                    multi-paragraph email copy above by default - so they get
                    one combined "Message" box instead of a separate one
                    each. Selecting any combination of the three (with or
                    without email) still sends each of them independently -
                    this box only controls what they all say, not whether
                    they're sent. */}
                {otherChannelsSelected && (() => {
                    const sharedMax = channels.includes("sms") ? SMS_MAX : SHARED_MAX;
                    const sharedHint = `${effectiveSharedMessage.length}/${sharedMax}`
                        + (channels.includes("sms") ? " · long messages are split into multiple SMS segments by the gateway" : "")
                        + (channels.includes("whatsapp") && !channels.includes("sms") ? " · WhatsApp only reaches recipients who've opted into WhatsApp updates" : "");
                    const onSharedChange = (e) => {
                        if (emailSelected) {
                            setSharedMessage(e.target.value);
                        } else {
                            setMessage(e.target.value);
                        }
                        setConfirming(false);
                    };

                    // Boxed, labelled sub-section when it sits alongside the
                    // email box above; the page's single plain box (matching
                    // the original "just a Message field" layout) when email
                    // isn't selected at all.
                    return emailSelected ? (
                        <div className="border border-line rounded-md p-3 space-y-1 bg-sand/30">
                            <p className="text-xs font-medium text-ink">Message (SMS / WhatsApp / In-app)</p>
                            <Input
                                as="textarea"
                                label="Message"
                                value={sharedMessage}
                                onChange={onSharedChange}
                                maxLength={sharedMax}
                                rows={3}
                                hint={sharedHint}
                            />
                        </div>
                    ) : (
                        <div>
                            <label htmlFor="broadcast-message" className="block text-sm mb-1">Message</label>
                            <textarea
                                id="broadcast-message"
                                value={message}
                                onChange={onSharedChange}
                                maxLength={sharedMax}
                                rows={5}
                                className="w-full border border-line rounded-md px-3 py-2 text-base focus-ring bg-paper"
                            />
                            <p className="text-xs text-ash mt-1">{sharedHint}</p>
                        </div>
                    );
                })()}

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
