import { useEffect, useState } from "react";
import api from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import EmptyState from "../components/ui/EmptyState";

export default function LiveSelling() {
    const [sessions, setSessions] = useState(null);

    useEffect(() => {
        api.get("/live-selling").then(({ data }) => setSessions(data.data)).catch(() => setSessions([]));
    }, []);

    if (sessions === null) return <PageLoader />;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Live selling" description="Upcoming live selling sessions from NEXORA sellers." />
            <h1 className="font-display text-2xl mb-1">Live selling</h1>
            <p className="text-ash text-sm mb-8">Upcoming live sessions from sellers - tap through to watch wherever they're streaming.</p>

            {sessions.length === 0 ? (
                <EmptyState title="No sessions scheduled" hint="Check back soon." />
            ) : (
                <ul className="space-y-3">
                    {sessions.map((s) => (
                        <li key={s.id} className="border border-line rounded-lg p-4">
                            <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                                <p className="font-medium text-sm">{s.title}</p>
                                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${s.status === "live" ? "bg-coral text-white" : "bg-line text-ash"}`}>
                                    {s.status === "live" ? "Live now" : new Date(s.scheduled_at).toLocaleString()}
                                </span>
                            </div>
                            <p className="text-xs text-ash mb-2">{s.store_name}</p>
                            {s.description && <p className="text-sm mb-3">{s.description}</p>}
                            <a
                                href={s.external_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-teal text-sm hover:underline"
                            >
                                Watch →
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
