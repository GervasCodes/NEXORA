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

    const loadConversations = () => {
        setLoading(true);
        setMaintenance(null);
        api.get("/chat/conversations")
            .then(({ data }) => setConversations(data.data))
            .catch((err) => {
                if (err.response?.data?.code === "MODULE_MAINTENANCE") {
                    setMaintenance(err.response.data.message);
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(loadConversations, []);

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

    if (loading) return <PageLoader />;
    if (maintenance) return <MaintenanceScreen title="Messages is under maintenance" message={maintenance} onRetry={loadConversations} />;

    if (conversations.length === 0) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">{t("messages.emptyTitle")}</p>
                <p className="text-ash text-sm">
                    {user.role === "buyer"
                        ? t("messages.emptyHintBuyer")
                        : t("messages.emptyHintSeller")}
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Messages" noIndex />
            <h1 className="font-display text-3xl mb-6">{t("messages.title")}</h1>

            <div className="relative mb-6">
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


            {query.trim() && filtered.length === 0 && (
                <p className="text-ash text-sm text-center py-10">{t("messages.noMatches", { query: query.trim() })}</p>
            )}

            <ul className="divide-y divide-line border-y border-line">
                {filtered.map((c, i) => (
                    <li key={c.id} className="group relative animate-fade-in" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                        <Link
                            to={`/messages/${c.id}`}
                            className="py-4 flex items-center gap-4 hover:bg-line/20 transition-colors -mx-2 px-2 rounded-md"
                        >
                            <Avatar name={otherPartyName(c)} src={otherPartyPhoto(c)} size="md" />

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium truncate">{otherPartyName(c)}</p>
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
                            <button
                                type="button"
                                onClick={() => setConfirmingId(c.id)}
                                aria-label={t("messages.deleteAria")}
                                className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-ash hover:text-coral opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity px-2 py-1"
                            >
                                {t("messages.deleteButton")}
                            </button>
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
        </div>
    );
}
