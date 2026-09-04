import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import EmptyState from "../components/ui/EmptyState";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { getEmbedUrl } from "../utils/liveSellingEmbed";
import { buildLiveSellingIcs, downloadIcs } from "../utils/icsCalendar";

// Phase 9 (UI/UX remediation) - one row's worth of UI, kept in its own
// component since it now carries meaningfully more state (embed toggle,
// reminder subscription) than a plain <li> did before.
function SessionRow({ session, user, toast }) {
    const [watching, setWatching] = useState(false);
    const [reminded, setReminded] = useState(false);
    const [remindBusy, setRemindBusy] = useState(false);
    const embedUrl = getEmbedUrl(session.external_link);
    const isScheduled = session.status === "scheduled";

    useEffect(() => {
        if (user?.role !== "buyer" || !isScheduled) return;
        api.get(`/live-selling/${session.id}/remind`)
            .then(({ data }) => setReminded(data.data.subscribed))
            .catch(() => {});
    }, [session.id, user, isScheduled]);

    const handleToggleRemind = async () => {
        setRemindBusy(true);
        try {
            if (reminded) {
                await api.delete(`/live-selling/${session.id}/remind`);
                setReminded(false);
            } else {
                await api.post(`/live-selling/${session.id}/remind`);
                setReminded(true);
            }
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setRemindBusy(false);
        }
    };

    const handleAddToCalendar = () => {
        const ics = buildLiveSellingIcs({
            id: session.id,
            title: session.title,
            description: session.description,
            scheduledAt: session.scheduled_at,
            externalLink: session.external_link
        });
        downloadIcs(ics, `${session.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`);
    };

    return (
        <li className="border border-line rounded-lg p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                <p className="font-medium text-sm">{session.title}</p>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${session.status === "live" ? "bg-coral text-white" : "bg-line text-ash"}`}>
                    {session.status === "live" ? "Live now" : new Date(session.scheduled_at).toLocaleString()}
                </span>
            </div>
            <p className="text-xs text-ash mb-2">{session.store_name}</p>
            {session.description && <p className="text-sm mb-3">{session.description}</p>}

            {watching && embedUrl ? (
                <div className="aspect-video bg-abyss rounded-md overflow-hidden mb-3">
                    <iframe
                        src={embedUrl}
                        title={session.title}
                        className="w-full h-full"
                        allow="autoplay; encrypted-media; picture-in-picture"
                        allowFullScreen
                    />
                </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-4">
                {embedUrl ? (
                    <button
                        type="button"
                        onClick={() => setWatching((v) => !v)}
                        className="text-teal text-sm hover:underline"
                    >
                        {watching ? "Hide player" : "▶ Watch here"}
                    </button>
                ) : null}
                <a
                    href={session.external_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal text-sm hover:underline"
                >
                    {embedUrl ? "Open on original site →" : "Watch →"}
                </a>

                {isScheduled && (
                    <>
                        {user?.role === "buyer" && (
                            <button
                                type="button"
                                onClick={handleToggleRemind}
                                disabled={remindBusy}
                                className={`text-sm hover:underline disabled:opacity-60 ${reminded ? "text-teal" : "text-ash"}`}
                            >
                                {reminded ? "🔔 We'll notify you" : "🔔 Notify me"}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleAddToCalendar}
                            className="text-ash text-sm hover:underline"
                        >
                            📅 Add to calendar
                        </button>
                    </>
                )}
            </div>
        </li>
    );
}

export default function LiveSelling() {
    const [sessions, setSessions] = useState(null);
    const { user } = useAuth();
    const toast = useToast();

    useEffect(() => {
        api.get("/live-selling").then(({ data }) => setSessions(data.data)).catch(() => setSessions([]));
    }, []);

    if (sessions === null) return <PageLoader />;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Live selling" description="Upcoming live selling sessions from NEXORA sellers." />
            <h1 className="font-display text-2xl mb-1">Live selling</h1>
            <p className="text-ash text-sm mb-8">
                Upcoming live sessions from sellers - watch right here when we can, or head to wherever they're streaming.
            </p>

            {sessions.length === 0 ? (
                <EmptyState title="No sessions scheduled" hint="Check back soon." />
            ) : (
                <ul className="space-y-3">
                    {sessions.map((s) => (
                        <SessionRow key={s.id} session={s} user={user} toast={toast} />
                    ))}
                </ul>
            )}
        </div>
    );
}
