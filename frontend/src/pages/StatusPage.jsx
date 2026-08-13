import { useEffect, useState } from "react";
import api from "../api/client";
import { formatDate } from "../utils/format";
import PageLoader from "../components/PageLoader";
import PageMeta from "../components/PageMeta";

const SEVERITY_STYLES = {
    minor: "bg-mango/10 text-mango-dark",
    major: "bg-coral/10 text-coral",
    critical: "bg-coral text-paper"
};

const STATUS_STYLES = {
    investigating: "bg-coral/10 text-coral",
    identified: "bg-mango/10 text-mango-dark",
    monitoring: "bg-azure/10 text-azure-deep",
    resolved: "bg-teal/10 text-teal"
};

const SLA_TARGETS = [
    { label: "Platform uptime", target: "99.5% monthly" },
    { label: "Payment webhook processing", target: "< 30s from provider callback" },
    { label: "Dispute first response", target: "< 24 hours" },
    { label: "Support ticket first response", target: "< 24 hours" }
];

export default function StatusPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        api.get("/status")
            .then(({ data }) => setData(data.data))
            .catch(() => setError("Couldn't load platform status."))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <PageLoader />;

    const isHealthy = data && data.health.status === "ok" && data.ongoing.length === 0;

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="System Status" description="Current NEXORA platform health, active incidents, and service targets." />
            <h1 className="font-display text-3xl mb-1">NEXORA status</h1>
            <p className="text-ash text-sm mb-8">Current platform health, active incidents, and our service targets.</p>

            {error && <p role="alert" className="text-coral text-sm mb-6">{error}</p>}

            {data && (
                <>
                    <div className={`flex items-center gap-3 rounded-lg p-4 mb-8 ${isHealthy ? "bg-teal/10" : "bg-coral/10"}`}>
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isHealthy ? "bg-teal" : "bg-coral"}`} />
                        <p className={`text-sm font-medium ${isHealthy ? "text-teal" : "text-coral"}`}>
                            {isHealthy ? "All systems operational" : data.ongoing.length > 0 ? "We're aware of an ongoing issue" : "Degraded performance detected"}
                        </p>
                    </div>

                    {data.ongoing.length > 0 && (
                        <div className="mb-8">
                            <h2 className="font-display text-lg mb-3">Ongoing incidents</h2>
                            <ul className="space-y-3">
                                {data.ongoing.map((incident) => (
                                    <li key={incident.id} className="border border-line rounded-lg p-4">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${SEVERITY_STYLES[incident.severity]}`}>
                                                {incident.severity}
                                            </span>
                                            <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${STATUS_STYLES[incident.status]}`}>
                                                {incident.status}
                                            </span>
                                            <span className="text-xs text-ash capitalize">{incident.component}</span>
                                        </div>
                                        <p className="font-medium text-sm mb-1">{incident.title}</p>
                                        <p className="text-sm text-ash">{incident.message}</p>
                                        <p className="text-xs text-ash mt-2">Since {formatDate(incident.started_at)}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="mb-8">
                        <h2 className="font-display text-lg mb-3">Service level targets</h2>
                        <ul className="divide-y divide-line border-y border-line">
                            {SLA_TARGETS.map((sla) => (
                                <li key={sla.label} className="py-2.5 flex items-center justify-between text-sm">
                                    <span>{sla.label}</span>
                                    <span className="text-ash">{sla.target}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <h2 className="font-display text-lg mb-3">Recent history</h2>
                        {data.recentIncidents.length === 0 ? (
                            <p className="text-ash text-sm">No incidents reported in recent history.</p>
                        ) : (
                            <ul className="space-y-3">
                                {data.recentIncidents.map((incident) => (
                                    <li key={incident.id} className="border border-line rounded-lg p-4">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${STATUS_STYLES[incident.status]}`}>
                                                {incident.status}
                                            </span>
                                            <span className="text-xs text-ash capitalize">{incident.component}</span>
                                        </div>
                                        <p className="font-medium text-sm mb-1">{incident.title}</p>
                                        <p className="text-xs text-ash">
                                            {formatDate(incident.started_at)}
                                            {incident.resolved_at ? ` – resolved ${formatDate(incident.resolved_at)}` : ""}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
