import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import PageLoader from "../components/PageLoader";
import MaintenanceScreen from "../components/MaintenanceScreen";
import { useToast } from "../context/ToastContext";
import Avatar from "../components/ui/Avatar";

// Phase 8 (UI/UX remediation) - search here is now two things layered
// together, and it's worth being explicit about the difference:
//   1. The existing local filter (unchanged) narrows the *visible list*
//      of conversations by name/product/last-message-preview - instant,
//      client-side, no request.
//   2. New: once the query is long enough, a debounced request to
//      GET /chat/conversations/search also runs, searching actual
//      message *content* across every conversation (not just the last
//      message), including threads the local filter above wouldn't
//      surface at all - results render in their own section below,
//      each deep-linking into the matching thread.
const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 350;

export default function Messages() {
    const { user } = useAuth();
    const { t } = useLanguage();
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmingId, setConfirmingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const toast = useToast();
    const [maintenance, setMaintenance] = useState(null);
    const [query, setQuery] = useState("");
    const [view, setView] = useState("active"); // "active" | "archived"
    const [busyAction, setBusyAction] = useState(null);

    // Cross-conversation message search (Phase 8).
    const [messageResults, setMessageResults] = useState(null);
    const [searchingMessages, setSearchingMessages] = useState(false);

    const loadConversations = (targetView = view) => {
        setLoading(true);
        setMaintenance(null);
        api.get("/chat/conversations", { params: { archived: targetView === "archived" } })
            .then(({ data }) => setConversations(data.data))
            .catch((err) => {
                if (err.response?.data?.code === "MODULE_MAINTENANCE") {
                    setMaintenance(err.response.data.message);
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => loadConversations(view), [view]);

    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed.length < SEARCH_MIN_CHARS) {
            setMessageResults(null);
            return;
        }
        setSearchingMessages(true);
        const timer = setTimeout(() => {
            api.get("/chat/conversations/search", { params: { q: trimmed } })
                .then(({ data }) => setMessageResults(data.data))
                .catch(() => setMessageResults([]))
                .finally(() => setSearchingMessages(false));
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [query]);

    const otherPartyName = (c) => {
        const isMeBuyer = c.buyer_id === user.id;
        return isMeBuyer
            ? `${c.seller_first_name} ${c.seller_last_name}`
            : `${c.buyer_first_name} ${c.buyer_last_name}`;
    };

    // Phase 4 (Real Imagery & Avatars): same buyer/seller branch
    // otherPartyName uses above, just returning the photo column
    // findConversationsByUser now selects instead of the name.
    const otherPartyPhoto = (c) => {
        const isMeBuyer = c.buyer_id === user.id;
        return isMeBuyer ? c.seller_photo_url : c.buyer_photo_url;
    };

    const filtered = conversations.filter((c) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
            otherPartyName(c).toLowerCase().includes(q) ||
            (c.product_name || "").toLowerCase().includes(q) ||
            (c.last_message || "").toLowerCase().includes(q)
        );
    });

    const handleDeleteConversation = async (conversationId) => {
        setDeletingId(conversationId);
        try {
            await api.delete(`/chat/conversations/${conversationId}`);
            setConversations((prev) => prev.filter((c) => c.id !== conversationId));
            setConfirmingId(null);
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setDeletingId(null);
        }
    };

    // Mute / archive (Phase 8, UI/UX remediation) - optimistic removal
    // from the current list (an archived conversation no longer belongs
    // in "active", and vice versa if unarchiving from the archived
    // view); mute doesn't change which list a conversation is in, so it
    // just flips its own my_muted_at locally.
    const handleToggleMute = async (c) => {
        setBusyAction(c.id);
        try {
            if (c.my_muted_at) {
                await api.delete(`/chat/conversations/${c.id}/mute`);
            } else {
                await api.put(`/chat/conversations/${c.id}/mute`);
            }
            setConversations((prev) => prev.map((item) =>
                item.id === c.id ? { ...item, my_muted_at: item.my_muted_at ? null : new Date().toISOString() } : item
            ));
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyAction(null);
        }
    };

    const handleToggleArchive = async (c) => {
        setBusyAction(c.id);
        try {
            if (view === "archived") {
                await api.delete(`/chat/conversations/${c.id}/archive`);
            } else {
                await api.put(`/chat/conversations/${c.id}/archive`);
            }
            setConversations((prev) => prev.filter((item) => item.id !== c.id));
        } catch (err) {
            toast?.error(extractErrorMessage(err));
        } finally {
            setBusyAction(null);
        }
    };

    if (loading) return <PageLoader />;
    if (maintenance) return <MaintenanceScreen title="Messages is under maintenance" message={maintenance} onRetry={() => loadConversations()} />;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Messages" noIndex />
            <div className="flex items-center justify-between mb-6">
                <h1 className="font-display text-3xl">{t("messages.title")}</h1>
            </div>

            <div className="flex gap-1 border-b border-line mb-6">
                <button
                    onClick={() => setView("active")}
                    className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        view === "active" ? "border-ink text-ink" : "border-transparent text-ash hover:text-ink"
                    }`}
                >
                    {t("messages.title")}
                </button>
                <button
                    onClick={() => setView("archived")}
                    className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        view === "archived" ? "border-ink text-ink" : "border-transparent text-ash hover:text-ink"
                    }`}
                >
                    {t("messages.archivedTab")}
                </button>
            </div>

            <div className="relative mb-3">
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-ash pointer-events-none"
                >
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                    <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("messages.searchPlaceholder")}
                    className="w-full border border-line rounded-full pl-9 pr-4 py-2 text-sm focus-ring"
                />
            </div>

            {/* Cross-conversation message results (Phase 8) - separate
                from the conversation-list filter below, since this
                searches message content across every thread, not just
                what's visible in the current view/list. */}
            {query.trim().length >= SEARCH_MIN_CHARS && (
                <div className="mb-6">
                    {searchingMessages && <p className="text-xs text-ash">{t("messages.searchingMessages")}</p>}
                    {!searchingMessages && messageResults?.length > 0 && (
                        <div className="border border-line rounded-lg divide-y divide-line overflow-hidden">
                            <p className="text-xs font-semibold uppercase tracking-wide text-ash px-3 py-2 bg-line/20">
                                {t("messages.messageResultsHeading", { query: query.trim() })}
                            </p>
                            {messageResults.map((m) => (
                                <Link
                                    key={m.id}
                                    to={`/messages/${m.conversation_id}`}
                                    className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-line/20 transition-colors"
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-ink">{m.other_first_name} {m.other_last_name}</p>
                                        <p className="text-xs text-ash truncate">{m.message}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                    {!searchingMessages && messageResults?.length === 0 && (
                        <p className="text-xs text-ash">{t("messages.noMessageResults", { query: query.trim() })}</p>
                    )}
                </div>
            )}

            {conversations.length === 0 && !query.trim() && (
                <div className="text-center py-16">
                    <p className="font-display text-xl mb-2">
                        {view === "archived" ? t("messages.emptyArchived") : t("messages.emptyTitle")}
                    </p>
                    {view === "active" && (
                        <p className="text-ash text-sm">
                            {user.role === "buyer" ? t("messages.emptyHintBuyer") : t("messages.emptyHintSeller")}
                        </p>
                    )}
                </div>
            )}

            {query.trim() && filtered.length === 0 && conversations.length > 0 && (
                <p className="text-ash text-sm text-center py-10">{t("messages.noMatches", { query: query.trim() })}</p>
            )}

            {filtered.length > 0 && (
                <ul className="divide-y divide-line border-y border-line">
                    {filtered.map((c, i) => (
                        <li key={c.id} className="group relative animate-fade-in" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                            <Link
                                to={`/messages/${c.id}`}
                                className="py-4 flex items-center gap-4 hover:bg-line/20 transition-colors -mx-2 px-2 rounded-md"
                            >
                                <Avatar name={otherPartyName(c)} src={otherPartyPhoto(c)} size="md" />

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 justify-between gap-2">
                                        <span className="flex items-center gap-1.5 min-w-0">
                                            <p className="text-sm font-medium truncate">{otherPartyName(c)}</p>
                                            {c.my_muted_at && (
                                                <span title={t("messages.mutedIndicator")} aria-label={t("messages.mutedIndicator")} className="text-ash shrink-0">🔕</span>
                                            )}
                                        </span>
                                        {c.unread_count > 0 && (
                                            <span className="bg-mango text-abyss text-[10px] font-mono font-semibold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center shrink-0">
                                                {c.unread_count > 9 ? "9+" : c.unread_count}
                                            </span>
                                        )}
                                    </div>
                                    {c.product_name && (
                                        <p className="text-xs text-azure-deep truncate">{t("messages.reLabel", { product: c.product_name })}</p>
                                    )}
                                    <p className="text-xs text-ash truncate">{c.last_message || t("messages.noMessagePreview")}</p>
                                </div>
                            </Link>

                            {confirmingId !== c.id ? (
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                    <button
                                        type="button"
                                        onClick={() => handleToggleMute(c)}
                                        disabled={busyAction === c.id}
                                        aria-label={c.my_muted_at ? t("messages.unmuteAria") : t("messages.muteAria")}
                                        className="text-xs text-ash hover:text-ink px-1.5 py-1 disabled:opacity-50"
                                    >
                                        {c.my_muted_at ? "🔔" : "🔕"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleToggleArchive(c)}
                                        disabled={busyAction === c.id}
                                        aria-label={view === "archived" ? t("messages.unarchiveAria") : t("messages.archiveAria")}
                                        className="text-xs text-ash hover:text-ink px-1.5 py-1 disabled:opacity-50"
                                    >
                                        {view === "archived" ? "📤" : "🗄️"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmingId(c.id)}
                                        aria-label={t("messages.deleteAria")}
                                        className="text-xs text-ash hover:text-coral px-1.5 py-1"
                                    >
                                        {t("messages.deleteButton")}
                                    </button>
                                </div>
                            ) : (
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 glass-strong rounded-md shadow-lg px-3 py-2 flex items-center gap-2 text-xs z-10 whitespace-nowrap">
                                    <span className="text-ash">{t("chat.deleteConversationConfirm")}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteConversation(c.id)}
                                        disabled={deletingId === c.id}
                                        className="text-coral font-medium hover:underline disabled:opacity-60"
                                    >
                                        {deletingId === c.id ? t("chat.deleting") : t("chat.confirmDelete")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmingId(null)}
                                        className="text-ash hover:text-ink"
                                    >
                                        {t("common.cancel")}
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
