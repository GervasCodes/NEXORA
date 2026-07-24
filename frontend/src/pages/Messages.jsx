import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Messages() {
    const { user } = useAuth();
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmingId, setConfirmingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        api.get("/chat/conversations")
            .then(({ data }) => setConversations(data.data))
            .finally(() => setLoading(false));
    }, []);

    const otherPartyName = (c) => {
        const isMeBuyer = c.buyer_id === user.id;
        return isMeBuyer
            ? `${c.seller_first_name} ${c.seller_last_name}`
            : `${c.buyer_first_name} ${c.buyer_last_name}`;
    };

    const handleDeleteConversation = async (conversationId) => {
        setDeletingId(conversationId);
        setError("");
        try {
            await api.delete(`/chat/conversations/${conversationId}`);
            setConversations((prev) => prev.filter((c) => c.id !== conversationId));
            setConfirmingId(null);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setDeletingId(null);
        }
    };

    if (loading) return <div className="max-w-2xl mx-auto px-6 py-16 text-ash">Loading messages…</div>;

    if (conversations.length === 0) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">No messages yet</p>
                <p className="text-ash text-sm">
                    {user.role === "buyer"
                        ? "Message a seller from any product page to start a conversation."
                        : "Buyers can message you from your product pages."}
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <h1 className="font-display text-3xl mb-8">Messages</h1>

            {error && <p role="alert" className="text-coral text-sm mb-4">{error}</p>}

            <ul className="divide-y divide-line border-y border-line">
                {conversations.map((c) => (
                    <li key={c.id} className="group relative">
                        <Link
                            to={`/messages/${c.id}`}
                            className="py-4 flex items-center gap-4 hover:bg-line/20 transition-colors -mx-2 px-2 rounded-md"
                        >
                            <div className="w-10 h-10 rounded-full bg-abyss text-paper flex items-center justify-center font-display text-sm shrink-0">
                                {otherPartyName(c).charAt(0).toUpperCase()}
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium truncate">{otherPartyName(c)}</p>
                                    {c.unread_count > 0 && (
                                        <span className="bg-mango text-abyss text-[10px] font-mono font-semibold rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                                            {c.unread_count}
                                        </span>
                                    )}
                                </div>
                                {c.product_name && (
                                    <p className="text-xs text-azure-deep truncate">Re: {c.product_name}</p>
                                )}
                                <p className="text-xs text-ash truncate">{c.last_message || "No messages yet"}</p>
                            </div>
                        </Link>

                        {confirmingId !== c.id ? (
                            <button
                                type="button"
                                onClick={() => setConfirmingId(c.id)}
                                aria-label="Delete conversation"
                                className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-ash hover:text-coral opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity px-2 py-1"
                            >
                                Delete
                            </button>
                        ) : (
                            <div className="absolute right-1 top-1/2 -translate-y-1/2 glass-strong rounded-md shadow-lg px-3 py-2 flex items-center gap-2 text-xs z-10 whitespace-nowrap">
                                <span className="text-ash">Delete this chat?</span>
                                <button
                                    type="button"
                                    onClick={() => handleDeleteConversation(c.id)}
                                    disabled={deletingId === c.id}
                                    className="text-coral font-medium hover:underline disabled:opacity-60"
                                >
                                    {deletingId === c.id ? "Deleting…" : "Yes, delete"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setConfirmingId(null)}
                                    className="text-ash hover:text-ink"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
