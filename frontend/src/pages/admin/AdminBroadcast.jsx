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

export default function AdminBroadcast() {
    const toast = useToast();
    const [segment, setSegment] = useState("all_buyers");
    const [channels, setChannels] = useState(["email"]);
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [audience, setAudience] = useState(null);
    const [previewing, setPreviewing] = useState(false);
    const [sending, setSending] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [lastResult, setLastResult] = useState(null);
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(true);

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

    const handleSend = async () => {
        if (!confirming) {
            setConfirming(true);
            return;
        }

        setSending(true);
        try {
            const { data } = await api.post("/admin/broadcasts", { segment, channels, subject, message });
            setLastResult(data.data);
            toast?.success("Broadcast sent");
            setMessage("");
            setSubject("");
            setConfirming(false);
            loadHistory();
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setSending(false);
        }
    };

    const canSend = channels.length > 0 && message.trim() && (!channels.includes("email") || subject.trim());

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

                {channels.includes("email") && (
                    <Input
                        label="Subject"
                        value={subject}
                        onChange={(e) => { setSubject(e.target.value); setConfirming(false); }}
                        maxLength={150}
                    />
                )}

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
                    <p className="text-xs text-ash mt-1">{message.length}/2000</p>
                </div>

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
                    {history.map((b) => (
                        <li key={b.id} className="py-3 text-sm">
                            <div className="flex justify-between">
                                <span className="font-medium capitalize">{b.segment.replace(/_/g, " ")}</span>
                                <span className="text-ash text-xs">{formatDateTime(b.created_at)}</span>
                            </div>
                            <p className="text-ash text-xs mt-0.5">
                                {b.channels} · {b.recipient_count} recipients · by {b.admin_first_name} {b.admin_last_name}
                            </p>
                            {b.subject && <p className="text-xs mt-0.5">Subject: {b.subject}</p>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
