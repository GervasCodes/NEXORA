import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../utils/format";

const CATEGORIES = [
    { value: "order", label: "Order" },
    { value: "payment", label: "Payment" },
    { value: "account", label: "Account" },
    { value: "product", label: "Product" },
    { value: "other", label: "Other" }
];

// Site-wide floating widget (separate from buyer<->seller/delivery chat
// - this is "talk to NEXORA support", not "talk to the person I'm
// transacting with"). Hidden on admin routes, which get their own
// dedicated queue page (pages/admin/AdminSupport.jsx) instead of this
// bubble.
export default function SupportWidget() {
    const { user } = useAuth();
    const location = useLocation();

    const [open, setOpen] = useState(false);
    const [tickets, setTickets] = useState(null);
    const [activeTicket, setActiveTicket] = useState(null);
    const [creating, setCreating] = useState(false);

    const [subject, setSubject] = useState("");
    const [category, setCategory] = useState("other");
    const [message, setMessage] = useState("");
    const [replyBody, setReplyBody] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const loadTickets = () => {
        api.get("/support").then(({ data }) => setTickets(data.data)).catch(() => {});
    };

    useEffect(() => {
        if (open && !tickets) loadTickets();
    }, [open, tickets]);

    if (!user || location.pathname.startsWith("/admin")) return null;

    const openTicket = (id) => {
        setError("");
        api.get(`/support/${id}`).then(({ data }) => setActiveTicket(data.data)).catch((err) => setError(extractErrorMessage(err)));
    };

    const submitNewTicket = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            const { data } = await api.post("/support", { subject, category, message });
            setSubject("");
            setMessage("");
            setCreating(false);
            setTickets(null);
            setActiveTicket(data.data);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const submitReply = async (e) => {
        e.preventDefault();
        if (!replyBody.trim()) return;
        setBusy(true);
        setError("");
        try {
            const { data } = await api.post(`/support/${activeTicket.id}/reply`, { body: replyBody });
            setActiveTicket(data.data);
            setReplyBody("");
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed bottom-5 right-5 z-40">
            {open && (
                <div className="mb-3 w-80 max-h-[28rem] flex flex-col bg-paper border border-line rounded-lg shadow-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                        <p className="font-display text-sm">
                            {activeTicket ? activeTicket.subject : creating ? "New ticket" : "Support"}
                        </p>
                        {(activeTicket || creating) && (
                            <button
                                onClick={() => { setActiveTicket(null); setCreating(false); }}
                                className="text-xs text-ash hover:text-ink"
                            >
                                Back
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {error && <p className="text-xs text-coral mb-2">{error}</p>}

                        {activeTicket ? (
                            <div className="space-y-3">
                                {activeTicket.messages.map((m) => (
                                    <div key={m.id} className={`text-xs ${m.sender_role === "admin" ? "text-left" : "text-right"}`}>
                                        <p className={`inline-block px-3 py-2 rounded-lg ${m.sender_role === "admin" ? "bg-line" : "bg-ink text-paper"}`}>
                                            {m.body}
                                        </p>
                                        <p className="text-ash mt-0.5">{formatDate(m.created_at)}</p>
                                    </div>
                                ))}
                            </div>
                        ) : creating ? (
                            <form id="support-new-ticket-form" onSubmit={submitNewTicket} className="space-y-2">
                                <input
                                    required
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="Subject"
                                    className="w-full border border-line rounded-md px-2.5 py-1.5 text-sm focus-ring"
                                />
                                <select
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="w-full border border-line rounded-md px-2.5 py-1.5 text-sm focus-ring bg-paper"
                                >
                                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                                <textarea
                                    required
                                    rows={4}
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="How can we help?"
                                    className="w-full border border-line rounded-md px-2.5 py-1.5 text-sm focus-ring resize-none"
                                />
                            </form>
                        ) : tickets === null ? (
                            <p className="text-xs text-ash">Loading…</p>
                        ) : tickets.length === 0 ? (
                            <p className="text-xs text-ash">No tickets yet. Start a new one below.</p>
                        ) : (
                            <ul className="space-y-2">
                                {tickets.map((t) => (
                                    <li key={t.id}>
                                        <button
                                            onClick={() => openTicket(t.id)}
                                            className="w-full text-left border border-line rounded-md px-3 py-2 hover:border-ink transition-colors"
                                        >
                                            <p className="text-xs font-medium truncate">{t.subject}</p>
                                            <p className="text-[11px] text-ash capitalize">{t.status}</p>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="border-t border-line p-3">
                        {activeTicket ? (
                            <form onSubmit={submitReply} className="flex gap-2">
                                <input
                                    value={replyBody}
                                    onChange={(e) => setReplyBody(e.target.value)}
                                    placeholder="Type a reply…"
                                    className="flex-1 border border-line rounded-md px-2.5 py-1.5 text-sm focus-ring"
                                />
                                <button
                                    type="submit"
                                    disabled={busy}
                                    className="bg-ink text-paper px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-60"
                                >
                                    Send
                                </button>
                            </form>
                        ) : creating ? (
                            <button
                                type="submit"
                                form="support-new-ticket-form"
                                disabled={busy}
                                className="w-full bg-ink text-paper px-3 py-2 rounded-md text-xs font-semibold disabled:opacity-60"
                            >
                                {busy ? "Sending…" : "Send"}
                            </button>
                        ) : (
                            <button
                                onClick={() => setCreating(true)}
                                className="w-full bg-ink text-paper px-3 py-2 rounded-md text-xs font-semibold"
                            >
                                New ticket
                            </button>
                        )}
                    </div>
                </div>
            )}

            <button
                onClick={() => setOpen(!open)}
                aria-label="Support"
                className="w-12 h-12 rounded-full bg-ink text-paper shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
            >
                {open ? "✕" : "💬"}
            </button>
        </div>
    );
}
