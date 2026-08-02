import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import MessageBubble from "../components/chat/MessageBubble";
import TypingIndicator from "../components/chat/TypingIndicator";
import ImageLightbox from "../components/chat/ImageLightbox";
import MessageSearch from "../components/chat/MessageSearch";
import PageLoader from "../components/PageLoader";

// How long the "user is typing…" indicator stays up after the last
// typing_start with no follow-up typing_stop (covers a tab closing or a
// dropped connection instead of leaving it stuck forever).
const TYPING_TIMEOUT_MS = 5000;
// How long to wait after the last keystroke before emitting typing_stop.
const TYPING_STOP_DELAY_MS = 2000;
const MAX_ATTACHMENT_MB = 15;

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
    const [confirmingClear, setConfirmingClear] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [deletingChat, setDeletingChat] = useState(false);
    const [otherTyping, setOtherTyping] = useState(false);
    const [attachmentFile, setAttachmentFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const [highlightedId, setHighlightedId] = useState(null);

    const bottomRef = useRef(null);
    const fileInputRef = useRef(null);
    const typingStopTimer = useRef(null);
    const otherTypingTimer = useRef(null);
    const isTypingRef = useRef(false);

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
                prev.some((m) => m.id === payload.id) ? prev : [...prev, { reactions: [], ...payload }]
            );
            if (payload.sender_id !== user.id) {
                api.put(`/chat/conversations/${id}/read`).catch(() => {});
                setOtherTyping(false);
            }
        };

        const handleMessageDeleted = (payload) => {
            if (String(payload.conversation_id) !== String(id)) return;
            setMessages((prev) =>
                prev.map((m) => (m.id === payload.id ? { ...m, is_deleted: true, message: "" } : m))
            );
        };

        const handleTyping = (payload) => {
            if (String(payload.conversation_id) !== String(id) || payload.user_id === user.id) return;
            setOtherTyping(payload.is_typing);
            clearTimeout(otherTypingTimer.current);
            if (payload.is_typing) {
                otherTypingTimer.current = setTimeout(() => setOtherTyping(false), TYPING_TIMEOUT_MS);
            }
        };

        const handleMessagesRead = (payload) => {
            if (String(payload.conversation_id) !== String(id) || payload.reader_id === user.id) return;
            const now = new Date();
            setMessages((prev) =>
                prev.map((m) => (m.sender_id === user.id && !m.read_at ? { ...m, read_at: now, delivered_at: m.delivered_at || now } : m))
            );
        };

        const handleReactionUpdated = (payload) => {
            if (String(payload.conversation_id) !== String(id)) return;
            const reactions = groupReactionsForViewer(payload.reactions, user.id);
            setMessages((prev) =>
                prev.map((m) => (m.id === payload.message_id ? { ...m, reactions } : m))
            );
        };

        socket.on("new_message", handleNewMessage);
        socket.on("message_deleted", handleMessageDeleted);
        socket.on("typing", handleTyping);
        socket.on("messages_read", handleMessagesRead);
        socket.on("reaction_updated", handleReactionUpdated);

        return () => {
            socket.emit("leave_conversation", id);
            socket.off("new_message", handleNewMessage);
            socket.off("message_deleted", handleMessageDeleted);
            socket.off("typing", handleTyping);
            socket.off("messages_read", handleMessagesRead);
            socket.off("reaction_updated", handleReactionUpdated);
            clearTimeout(otherTypingTimer.current);
            clearTimeout(typingStopTimer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, id]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length]);

    // Raw reaction rows -> the same { emoji, count, userIds, mine } shape
    // the initial REST fetch already returns (see chat.service.js's
    // groupReactions), so live socket updates render identically to a
    // freshly-loaded conversation.
    const groupReactionsForViewer = (rows, viewerId) => {
        const byEmoji = {};
        for (const row of rows) {
            const entry = (byEmoji[row.emoji] ||= { emoji: row.emoji, count: 0, userIds: [], mine: false });
            entry.count += 1;
            entry.userIds.push(row.user_id);
            if (row.user_id === viewerId) entry.mine = true;
        }
        return Object.values(byEmoji);
    };

    const emitTyping = () => {
        if (!socket) return;
        if (!isTypingRef.current) {
            isTypingRef.current = true;
            socket.emit("typing_start", id);
        }
        clearTimeout(typingStopTimer.current);
        typingStopTimer.current = setTimeout(() => {
            isTypingRef.current = false;
            socket.emit("typing_stop", id);
        }, TYPING_STOP_DELAY_MS);
    };

    const stopTypingNow = () => {
        clearTimeout(typingStopTimer.current);
        if (isTypingRef.current && socket) {
            isTypingRef.current = false;
            socket.emit("typing_stop", id);
        }
    };

    const handleDraftChange = (e) => {
        setDraft(e.target.value);
        if (e.target.value.trim()) emitTyping();
        else stopTypingNow();
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
            setError(`Attachments must be under ${MAX_ATTACHMENT_MB}MB`);
            return;
        }
        setError("");
        setAttachmentFile(file);
    };

    const handleSend = async (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text && !attachmentFile) return;

        stopTypingNow();
        setSending(true);
        setError("");

        try {
            if (attachmentFile) {
                const formData = new FormData();
                formData.append("file", attachmentFile);
                if (text) formData.append("message", text);

                const { data } = await api.post(`/chat/conversations/${id}/attachments`, formData, {
                    headers: { "Content-Type": "multipart/form-data" },
                    onUploadProgress: (evt) => {
                        if (evt.total) setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
                    }
                });
                setMessages((prev) =>
                    prev.some((m) => m.id === data.data.id) ? prev : [...prev, { reactions: [], ...data.data }]
                );
                setAttachmentFile(null);
                setDraft("");
            } else {
                setDraft("");
                const { data } = await api.post(`/chat/conversations/${id}/messages`, { message: text });
                setMessages((prev) =>
                    prev.some((m) => m.id === data.data.id) ? prev : [...prev, { reactions: [], ...data.data }]
                );
            }
        } catch (err) {
            setError(extractErrorMessage(err));
            if (!attachmentFile) setDraft(text);
        } finally {
            setSending(false);
            setUploadProgress(null);
        }
    };

    const handleDeleteMessage = async (messageId) => {
        setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, is_deleted: true, message: "" } : m))
        );

        try {
            await api.delete(`/chat/conversations/${id}/messages/${messageId}`);
        } catch (err) {
            setError(extractErrorMessage(err));
        }
    };

    const handleReact = async (messageId, emoji) => {
        // Optimistic - the reaction_updated socket event (or the REST
        // response for a sender with no socket) will reconcile shortly.
        setMessages((prev) =>
            prev.map((m) => {
                if (m.id !== messageId) return m;
                const existing = m.reactions.find((r) => r.emoji === emoji);
                const reactions = existing
                    ? m.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r))
                    : [...m.reactions, { emoji, count: 1, userIds: [user.id], mine: true }];
                return { ...m, reactions };
            })
        );

        try {
            await api.post(`/chat/conversations/${id}/messages/${messageId}/reactions`, { emoji });
        } catch (err) {
            setError(extractErrorMessage(err));
        }
    };

    const handleRemoveReaction = async (messageId, emoji) => {
        setMessages((prev) =>
            prev.map((m) => {
                if (m.id !== messageId) return m;
                const reactions = m.reactions
                    .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r))
                    .filter((r) => r.count > 0);
                return { ...m, reactions };
            })
        );

        try {
            await api.delete(`/chat/conversations/${id}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
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

    const jumpToMessage = (messageId) => {
        setSearchOpen(false);
        const el = document.getElementById(`message-${messageId}`);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            setHighlightedId(messageId);
            setTimeout(() => setHighlightedId(null), 1500);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col h-[calc(100vh-64px)]">
            <div className="flex items-center justify-between mb-2 gap-2">
                <Link to="/messages" className="text-sm text-teal hover:underline inline-block shrink-0">
                    ← All messages
                </Link>

                {!confirmingClear && !confirmingDelete && (
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setSearchOpen((v) => !v)}
                            className="text-xs text-ash hover:text-ink transition-colors"
                            aria-label="Search this conversation"
                        >
                            Search
                        </button>
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

            {searchOpen && (
                <MessageSearch conversationId={id} onJumpTo={jumpToMessage} onClose={() => setSearchOpen(false)} />
            )}

            <div className="flex-1 overflow-y-auto space-y-3 pb-4">
                {messages.length === 0 && (
                    <p className="text-ash text-sm text-center py-10">No messages here yet.</p>
                )}

                {messages.map((m) => (
                    <MessageBubble
                        key={m.id}
                        message={m}
                        mine={m.sender_id === user.id}
                        highlighted={highlightedId === m.id}
                        onReact={handleReact}
                        onRemoveReaction={handleRemoveReaction}
                        onDeleteMessage={handleDeleteMessage}
                        onOpenLightbox={setLightboxSrc}
                    />
                ))}

                {otherTyping && <TypingIndicator />}

                <div ref={bottomRef} />
            </div>

            {error && <p role="alert" className="text-coral text-sm mb-2">{error}</p>}

            {attachmentFile && (
                <div className="flex items-center gap-2 border border-line rounded-lg px-3 py-2 mb-2 animate-slide-up">
                    <span className="text-xs truncate flex-1">
                        {attachmentFile.type.startsWith("image/") ? "🖼️" : "📎"} {attachmentFile.name}
                    </span>
                    {uploadProgress !== null && (
                        <span className="text-[10px] text-ash font-mono">{uploadProgress}%</span>
                    )}
                    <button
                        type="button"
                        onClick={() => setAttachmentFile(null)}
                        className="text-ash hover:text-coral text-xs px-1"
                        aria-label="Remove attachment"
                    >
                        ✕
                    </button>
                </div>
            )}

            <form
                onSubmit={handleSend}
                className="flex gap-2 border-t border-line pt-4 pb-[env(safe-area-inset-bottom)]"
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full border border-line text-ash hover:text-ink hover:border-ash transition-colors"
                    aria-label="Attach a file"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path
                            d="M21 11.5V7a4 4 0 0 0-4-4h-1a4 4 0 0 0-4 4v10a3 3 0 0 0 3 3 3 3 0 0 0 3-3V8"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                        />
                    </svg>
                </button>
                <input
                    value={draft}
                    onChange={handleDraftChange}
                    onBlur={stopTypingNow}
                    placeholder="Write a message…"
                    className="flex-1 min-w-0 border border-line rounded-full px-4 py-2 text-sm focus-ring"
                />
                <button
                    type="submit"
                    disabled={sending || (!draft.trim() && !attachmentFile)}
                    className="shrink-0 bg-mango text-abyss px-5 py-2 rounded-full text-sm font-semibold hover:bg-mango-dark transition-colors disabled:opacity-50"
                >
                    {sending ? "Sending…" : "Send"}
                </button>
            </form>

            <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
        </div>
    );
}
