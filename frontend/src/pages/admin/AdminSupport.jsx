import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import PageLoader from "../../components/PageLoader";
import { formatDate } from "../../utils/format";

const STATUS_STYLES = {
    open: "bg-mango/20 text-mango-dark",
    pending: "bg-azure/10 text-azure",
    resolved: "bg-teal text-white",
    closed: "bg-line text-ash"
};

const STATUS_FILTERS = ["", "open", "pending", "resolved", "closed"];

export default function AdminSupport() {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("");
    const [activeTicket, setActiveTicket] = useState(null);
    const [replyBody, setReplyBody] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const load = () => {
        setLoading(true);
        const params = {};
        if (status) params.status = status;
        api.get("/support/admin", { params }).then(({ data }) => setTickets(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, [status]);

    const openTicket = (id) => {
        setError("");
        api.get(`/support/${id}`).then(({ data }) => setActiveTicket(data.data)).catch((err) => setError(extractErrorMessage(err)));
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
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const changeStatus = async (newStatus) => {
        setBusy(true);
        try {
            const { data } = await api.put(`/support/admin/${activeTicket.id}/status`, { status: newStatus });
            setActiveTicket(data.data);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <PageMeta title="Support" noIndex />
            <h1 className="font-display text-2xl mb-1">Support</h1>
            <p className="text-ash text-sm mb-6">In-app help tickets and WhatsApp support requests.</p>

            <div className="grid md:grid-cols-[18rem_1fr] gap-6">
                <div>
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm mb-4"
                    >
                        {STATUS_FILTERS.map((s) => (
                            <option key={s} value={s}>{s ? s.charAt(0).toUpperCase() + s.slice(1) : "All statuses"}</option>
                        ))}
                    </select>

                    {loading ? (
                        <PageLoader />
                    ) : tickets.length === 0 ? (
                        <p className="text-ash text-sm">No tickets match this filter.</p>
                    ) : (
                        <ul className="space-y-2">
                            {tickets.map((t) => (
                                <li key={t.id}>
                                    <button
                                        onClick={() => openTicket(t.id)}
                                        className={`w-full text-left border rounded-md px-3 py-2 hover:border-ink transition-colors ${activeTicket?.id === t.id ? "border-ink" : "border-line"}`}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-1">
                                            <p className="text-sm font-medium truncate">{t.subject}</p>
                                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize whitespace-nowrap ${STATUS_STYLES[t.status] || "bg-line text-ash"}`}>
                                                {t.status}
                                            </span>
                                        </div>
                                        <p className="text-xs text-ash">
                                            {t.first_name ? `${t.first_name} ${t.last_name || ""}` : t.contact_phone || "Guest"}
                                        </p>
                                        <p className="text-xs text-ash">{formatDate(t.updated_at)}</p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div>
                    {error && <p className="text-sm text-coral mb-3">{error}</p>}
                    {!activeTicket ? (
                        <p className="text-ash text-sm">Select a ticket to view its thread.</p>
                    ) : (
                        <div className="border border-line rounded-lg p-4">
                            <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                                <h2 className="font-display text-lg">{activeTicket.subject}</h2>
                                <div className="flex gap-2">
                                    {["open", "pending", "resolved", "closed"].map((s) => (
                                        <button
                                            key={s}
                                            disabled={busy || activeTicket.status === s}
                                            onClick={() => changeStatus(s)}
                                            className={`text-xs px-2.5 py-1 rounded-full capitalize border transition-colors disabled:opacity-100 ${activeTicket.status === s ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                                {activeTicket.messages.map((m) => (
                                    <div key={m.id} className={m.sender_role === "admin" ? "text-right" : "text-left"}>
                                        <p className={`inline-block px-3 py-2 rounded-lg text-sm ${m.sender_role === "admin" ? "bg-ink text-paper" : "bg-line"}`}>
                                            {m.body}
                                        </p>
                                        <p className="text-ash text-xs mt-0.5">{formatDate(m.created_at)}</p>
                                    </div>
                                ))}
                            </div>

                            <form onSubmit={submitReply} className="flex gap-2">
                                <input
                                    value={replyBody}
                                    onChange={(e) => setReplyBody(e.target.value)}
                                    placeholder="Reply…"
                                    className="flex-1 border border-line rounded-md px-3 py-2 text-sm focus-ring"
                                />
                                <button
                                    type="submit"
                                    disabled={busy}
                                    className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
                                >
                                    Send
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
