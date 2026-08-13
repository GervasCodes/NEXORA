import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import { formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";
import PageMeta from "../../components/PageMeta";

const COMPONENTS = ["platform", "payments", "orders", "bookings", "delivery", "notifications"];
const SEVERITIES = ["minor", "major", "critical"];
const STATUSES = ["investigating", "identified", "monitoring", "resolved"];

const STATUS_STYLES = {
    investigating: "bg-coral/10 text-coral",
    identified: "bg-mango/10 text-mango-dark",
    monitoring: "bg-azure/10 text-azure-deep",
    resolved: "bg-teal/10 text-teal"
};

export default function AdminStatusIncidents() {
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [showForm, setShowForm] = useState(false);
    const [title, setTitle] = useState("");
    const [message, setMessage] = useState("");
    const [component, setComponent] = useState("platform");
    const [severity, setSeverity] = useState("minor");
    const [submitting, setSubmitting] = useState(false);

    const load = () => {
        setLoading(true);
        api.get("/status/admin/incidents")
            .then(({ data }) => setIncidents(data.data))
            .catch(() => setError("Couldn't load incidents."))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const submitIncident = async (e) => {
        e.preventDefault();
        setError("");
        setSubmitting(true);
        try {
            await api.post("/status/admin/incidents", { title, message, component, severity });
            setTitle("");
            setMessage("");
            setComponent("platform");
            setSeverity("minor");
            setShowForm(false);
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const updateStatus = async (id, status) => {
        setError("");
        try {
            await api.put(`/status/admin/incidents/${id}`, { status });
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div className="animate-fade-in">
            <PageMeta title="Status Incidents" noIndex />
            <div className="flex items-center justify-between mb-1">
                <h1 className="font-display text-2xl">Status incidents</h1>
                <button onClick={() => setShowForm((v) => !v)} className="text-sm text-teal hover:underline">
                    {showForm ? "Cancel" : "Report an incident"}
                </button>
            </div>
            <p className="text-ash text-sm mb-6">Shown publicly on the /status page. Mark an incident resolved once it's fixed.</p>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            {showForm && (
                <form onSubmit={submitIncident} className="border border-line rounded-lg p-4 mb-6 space-y-3 max-w-lg">
                    <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Title"
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={3}
                        placeholder="What buyers/sellers should know"
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring" />
                    <div className="flex gap-3">
                        <select value={component} onChange={(e) => setComponent(e.target.value)} className="flex-1 border border-line rounded-md px-3 py-2 text-sm focus-ring">
                            {COMPONENTS.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="flex-1 border border-line rounded-md px-3 py-2 text-sm focus-ring">
                            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <button type="submit" disabled={submitting} className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50">
                        {submitting ? "Posting…" : "Post incident"}
                    </button>
                </form>
            )}

            {incidents.length === 0 ? (
                <p className="text-ash text-sm">No incidents on record.</p>
            ) : (
                <ul className="divide-y divide-line border-y border-line">
                    {incidents.map((incident) => (
                        <li key={incident.id} className="py-3 flex flex-wrap items-center gap-3 px-2 -mx-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{incident.title}</p>
                                <p className="text-xs text-ash capitalize">{incident.component} · {incident.severity} · {formatDate(incident.started_at)}</p>
                            </div>
                            <select
                                value={incident.status}
                                onChange={(e) => updateStatus(incident.id, e.target.value)}
                                className={`text-xs font-medium px-2 py-1 rounded-full capitalize border-0 ${STATUS_STYLES[incident.status]}`}
                            >
                                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
