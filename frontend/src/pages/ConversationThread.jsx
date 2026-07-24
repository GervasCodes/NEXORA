import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";

export default function ConversationThread() {
    const { id } = useParams();
    const { user } = useAuth();
    const { socket } = useSocket();
    const navigate = useNavigate();

    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");
    const [sending, setSending] = useState(false);
    const [openMenuId, setOpenMenuId] = useState(null);
    const [confirmingClear, setConfirmingClear] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [deletingChat, setDeletingChat] = useState(false);
    const bottomRef = useRef(null);

    useEffect(() => {
        setLoading(true);
        api.get(`/chat/conversations/${id}/messages`)
            .then(({ data }) => setMessages(data.data))
            .catch(() => setError("Couldn't load this conversation."))
            .finally(() => setLoading(false));

        api.put(`/chat/conversations/${id}/read`).catch(() => {});
    }, [id]);

    useEffect(() => {
        if (!socket) return;

        socket.emit("join_conversation", id);

        const handleNewMessage = (payload) => {
            if (String(payload.conversation_id) !== String(id)) return;
            setMessages((prev) =>
                prev.some((m) => m.id === payload.id) ? prev : [...prev, payload]
            );
        };

        
        const handleMessageDeleted = (payload) => {
            if (String(payload.conversation_id) !== String(id)) return;
            setMessages((prev) =>
                prev.map((m) => (m.id === payload.id ? { ...m, is_deleted: true, message: "" } : m))
            );
        };

        socket.on("new_message", handleNewMessage);
        socket.on("message_deleted", handleMessageDeleted);

        return () => {
            socket.emit("leave_conversation", id);
            socket.off("new_message", handleNewMessage);
            socket.off("message_deleted", handleMessageDeleted);
        };
    }, [socket, id]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text) return;

        setSending(true);
        setError("");
        setDraft("");

        try {
            const { data } = await api.post(`/chat/conversations/${id}/messages`, { message: text });
            setMessages((prev) =>
                prev.some((m) => m.id === data.data.id) ? prev : [...prev, data.data]
            );
        } catch (err) {
            setError(extractErrorMessage(err));
            setDraft(text);
        } finally {
            setSending(false);
        }
    };

    
    const handleDeleteMessage = async (messageId) => {
        setOpenMenuId(null);
        setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, is_deleted: true, message: "" } : m))
        );

        try {
            await api.delete(`/chat/conversations/${id}/messages/${messageId}`);
        } catch (err) {
            setError(extractErrorMessage(err));
        }
    };

    
    const handleClearChat = async () => {
        setClearing(true);
        setError("");
        try {
            await api.post(`/chat/conversations/${id}/clear`);
            setMessages([]);
            setConfirmingClear(false);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setClearing(false);
        }
    };

    
    const handleDeleteChat = async () => {
        setDeletingChat(true);
        setError("");
        try {
            await api.delete(`/chat/conversations/${id}`);
            navigate("/messages");
        } catch (err) {
            setError(extractErrorMessage(err));
            setDeletingChat(false);
        }
    };

    if (loading) return <div className="max-w-2xl mx-auto px-6 py-16 text-ash">Loading…</div>;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col h-[calc(100vh-64px)]">
            <div className="flex items-center justify-between mb-4">
                <Link to="/messages" className="text-sm text-teal hover:underline inline-block">
                    ← All messages
                </Link>

                {!confirmingClear && !confirmingDelete && (
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setConfirmingClear(true)}
                            className="text-xs text-ash hover:text-coral transition-colors"
                        >
                            Clear chat
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmingDelete(true)}
                            className="text-xs text-ash hover:text-coral transition-colors"
                        >
                            Delete chat
                        </button>
                    </div>
                )}

                {confirmingClear && (
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-ash">Clear for you?</span>
                        <button
                            type="button"
                            onClick={handleClearChat}
                            disabled={clearing}
                            className="text-coral font-medium hover:underline disabled:opacity-60"
                        >
                            {clearing ? "Clearing…" : "Yes, clear"}
                        </button>
                        <button type="button" onClick={() => setConfirmingClear(false)} className="text-ash hover:text-ink">
                            Cancel
                        </button>
                    </div>
                )}

                {confirmingDelete && (
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-ash">Delete this chat?</span>
                        <button
                            type="button"
                            onClick={handleDeleteChat}
                            disabled={deletingChat}
                            className="text-coral font-medium hover:underline disabled:opacity-60"
                        >
                            {deletingChat ? "Deleting…" : "Yes, delete"}
                        </button>
                        <button type="button" onClick={() => setConfirmingDelete(false)} className="text-ash hover:text-ink">
                            Cancel
                        </button>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pb-4">
                {messages.length === 0 && (
                    <p className="text-ash text-sm text-center py-10">No messages here yet.</p>
                )}

                {messages.map((m) => {
                    const mine = m.sender_id === user.id;
                    return (
                        <div key={m.id} className={`group flex items-center gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
                            {mine && !m.is_deleted && (
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)}
                                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-ash hover:text-ink transition-opacity px-1"
                                        aria-label="Message options"
                                    >
                                        ⋮
                                    </button>
                                    {openMenuId === m.id && (
                                        <div className="absolute right-0 bottom-full mb-1 glass-strong rounded-md shadow-lg py-1 z-10 whitespace-nowrap">
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteMessage(m.id)}
                                                className="block w-full text-left px-3 py-1.5 text-xs text-coral hover:bg-coral/10 transition-colors"
                                            >
                                                Delete message
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div
                                className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                                    m.is_deleted
                                        ? "italic text-ash bg-line/30 rounded-bl-sm"
                                        : mine
                                            ? "bg-abyss text-paper rounded-br-sm"
                                            : "bg-line/50 text-ink rounded-bl-sm"
                                }`}
                            >
                                {m.is_deleted ? "This message was deleted" : m.message}
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {error && <p role="alert" className="text-coral text-sm mb-2">{error}</p>}

            <form onSubmit={handleSend} className="flex gap-2 border-t border-line pt-4">
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write a message…"
                    className="flex-1 border border-line rounded-full px-4 py-2 text-sm focus-ring"
                />
                <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="bg-mango text-abyss px-5 py-2 rounded-full text-sm font-semibold hover:bg-mango-dark transition-colors disabled:opacity-50"
                >
                    Send
                </button>
            </form>
        </div>
    );
}
