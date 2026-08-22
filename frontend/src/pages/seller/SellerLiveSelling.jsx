import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import PageLoader from "../../components/PageLoader";

const EMPTY_FORM = { title: "", description: "", externalLink: "", scheduledAt: "" };

const STATUS_STYLES = {
    scheduled: "bg-line text-ash",
    live: "bg-coral text-white",
    ended: "bg-teal text-white",
    cancelled: "bg-line text-ash"
};

export default function SellerLiveSelling() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(EMPTY_FORM);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);

    const load = () => {
        setLoading(true);
        api.get("/live-selling/mine").then(({ data }) => setSessions(data.data)).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const submit = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError("");
        try {
            await api.post("/live-selling", {
                ...form,
                scheduledAt: new Date(form.scheduledAt).toISOString()
            });
            setForm(EMPTY_FORM);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setCreating(false);
        }
    };

    const setStatus = async (id, status) => {
        setBusyId(id);
        try {
            await api.put(`/live-selling/${id}/status`, { status });
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title="Live selling" noIndex />
            <h1 className="font-display text-2xl mb-1">Live selling</h1>
            <p className="text-ash text-sm mb-6">
                Schedule a session and share where you'll be streaming (Instagram, YouTube, TikTok Live, etc.) - NEXORA lists it and notifies interested buyers.
            </p>

            <form onSubmit={submit} className="border border-line rounded-lg p-4 mb-8 space-y-3">
                <h2 className="font-display text-lg">Schedule a session</h2>
                <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                <textarea placeholder="Description (optional)" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring resize-none" />
                <input required type="url" placeholder="Link to your stream (Instagram/YouTube/TikTok Live)" value={form.externalLink} onChange={(e) => setForm({ ...form, externalLink: e.target.value })} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                <input required type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />

                {error && <p className="text-sm text-coral">{error}</p>}

                <button type="submit" disabled={creating} className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                    {creating ? "Scheduling…" : "Schedule session"}
                </button>
            </form>

            <h2 className="font-display text-lg mb-3">Your sessions</h2>
            {sessions.length === 0 ? (
                <p className="text-ash text-sm">None scheduled yet.</p>
            ) : (
                <ul className="space-y-2">
                    {sessions.map((s) => (
                        <li key={s.id} className="border border-line rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <p className="font-medium text-sm">{s.title}</p>
                                <p className="text-ash text-xs">{new Date(s.scheduled_at).toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${STATUS_STYLES[s.status]}`}>
                                    {s.status}
                                </span>
                                {s.status === "scheduled" && (
                                    <button disabled={busyId === s.id} onClick={() => setStatus(s.id, "live")} className="text-xs border border-line px-2.5 py-1 rounded-full hover:border-ink">
                                        Go live
                                    </button>
                                )}
                                {s.status === "live" && (
                                    <button disabled={busyId === s.id} onClick={() => setStatus(s.id, "ended")} className="text-xs border border-line px-2.5 py-1 rounded-full hover:border-ink">
                                        End
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
