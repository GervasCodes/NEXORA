import { Fragment, useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useSocket } from "../context/SocketContext";
import MessageBubble from "../components/chat/MessageBubble";
import TypingIndicator from "../components/chat/TypingIndicator";
import ImageLightbox from "../components/chat/ImageLightbox";
import MessageSearch from "../components/chat/MessageSearch";
import DateSeparator from "../components/chat/DateSeparator";
import ChatWallpaperPicker from "../components/chat/ChatWallpaperPicker";
import ThreadSkeleton from "../components/chat/ThreadSkeleton";
import PageMeta from "../components/PageMeta";
import { ImageIcon, PaperclipIcon, ChatIcon } from "../components/Icons";
import { formatDate } from "../utils/format";
import { getWallpaper, loadStoredWallpaperId, storeWallpaperId } from "../utils/chatWallpaper";

// How long the "user is typing…" indicator stays up after the last
// typing_start with no follow-up typing_stop (covers a tab closing or a
// dropped connection instead of leaving it stuck forever).
const TYPING_TIMEOUT_MS = 5000;
// How long to wait after the last keystroke before emitting typing_stop.
const TYPING_STOP_DELAY_MS = 2000;
const MAX_ATTACHMENT_MB = 15;

export default function ConversationThread() {
    const { id } = useParams();
    const { user, sessionReady } = useAuth();
    const { t } = useLanguage();
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
    const [wallpaperPickerOpen, setWallpaperPickerOpen] = useState(false);
    const [wallpaperId, setWallpaperId] = useState(loadStoredWallpaperId);
    // Phase 8 sub-phase 3 (empty & loading states): distinguishes "the
    // history fetch actually failed" from "this is a genuinely brand-new
    // conversation" - both leave `messages` at `[]`, but they need very
    // different treatment (a retry vs. a friendly "say hello" placeholder).
    // Kept separate from the generic `error` string below, which is also
    // reused for later send/react/delete failures unrelated to this.
    const [loadFailed, setLoadFailed] = useState(false);

    const bottomRef = useRef(null);
    const fileInputRef = useRef(null);
    const typingStopTimer = useRef(null);
    const otherTypingTimer = useRef(null);
    const isTypingRef = useRef(false);
    // Whether the very first (history) render of this conversation has
    // already been scrolled into place - see the scrollIntoView effect
    // below for why this matters.
    const hasAutoScrolledRef = useRef(false);

    const loadMessages = () => {
        setLoading(true);
        setLoadFailed(false);
        hasAutoScrolledRef.current = false;
        api.get(`/chat/conversations/${id}/messages`)
            .then(({ data }) => setMessages(data.data))
            .catch(() => {
                // The dedicated loadFailed banner below already surfaces this
                // message with its own role="alert" and a retry action -
                // also setting the generic `error` string here duplicated it
                // as a second, redundant role="alert" element on the page.
                setLoadFailed(true);
            })
            .finally(() => setLoading(false));
    };

    useEffect(loadMessages, [id]);

    // Phase 5 (production error fixes): split out from the fetch effect
    // above. `PUT .../read` is a mutating request, so it needs the
    // X-CSRF-Token header - but that header is only populated once
    // AuthContext's own /auth/me bootstrap resolves and calls
    // setCsrfToken() (see api/client.js / AuthContext.jsx). On a fresh
    // load straight into a conversation (a deep link, or a hard
    // refresh while already on a thread), this effect used to fire the
    // PUT immediately alongside the GET above, before that token existed
    // - producing a real, and confirmed-recurring, 403
    // CSRF_TOKEN_INVALID that then triggered AuthContext's "please
    // refresh the page" prompt for what was really just an unhydrated
    // token, not an actually invalid session. Gating on `sessionReady`
    // (the same flag AuthContext's own comment says every consumer of a
    // protected endpoint should gate on) waits for that bootstrap to
    // finish first. The message list itself is fetched via GET above,
    // which carries no CSRF requirement, so it's left ungated and loads
    // immediately as before.
    useEffect(() => {
        if (!sessionReady) return;
        api.put(`/chat/conversations/${id}/read`).catch(() => {});
    }, [id, sessionReady]);

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

    // Phase 12 (Messaging UI Modernization) auto-scroll fix: this used to
    // always scroll with behavior: "smooth", including the very first
    // render of a conversation's full history - on a long thread, that
    // meant the browser visibly animated all the way down from the top
    // of the list before settling at the bottom (a "flash" through the
    // whole history) every time the page opened. Now the first
    // population of `messages` for a given conversation (tracked by
    // hasAutoScrolledRef, reset whenever `id` changes above) jumps
    // straight to the bottom with no animation; only messages arriving
    // after that point - a new send/receive - animate smoothly.
    useEffect(() => {
        if (messages.length === 0) return;
        bottomRef.current?.scrollIntoView({ behavior: hasAutoScrolledRef.current ? "smooth" : "auto" });
        hasAutoScrolledRef.current = true;
    }, [messages.length]);

    // Local-day comparison (not a UTC one) so "Today"/"Yesterday" match
    // what the reader's own clock says, the same reasoning
    // formatTimeRemaining (utils/format.js) already applies elsewhere.
    const isSameDay = (a, b) => {
        const da = new Date(a);
        const db = new Date(b);
        return (
            da.getFullYear() === db.getFullYear() &&
            da.getMonth() === db.getMonth() &&
            da.getDate() === db.getDate()
        );
    };

    const dateSeparatorLabel = (dateString) => {
        const now = new Date();
        if (isSameDay(dateString, now)) return t("chat.today");
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (isSameDay(dateString, yesterday)) return t("chat.yesterday");
        return formatDate(dateString);
    };

    const wallpaper = getWallpaper(wallpaperId);
    const handleSelectWallpaper = (id) => {
        setWallpaperId(id);
        storeWallpaperId(id);
        setWallpaperPickerOpen(false);
    };

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
            setError(t("chat.attachmentTooLarge", { size: MAX_ATTACHMENT_MB }));
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

    if (loading) return <ThreadSkeleton />;

    return (
        <div className="max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col h-[calc(100vh-64px)] supports-[height:100dvh]:h-[calc(100dvh-64px)]">
            <PageMeta title="Conversation" noIndex />
            {/* Phase 4 (SEO Supporting, H1 audit): this page has no heading
                anywhere - just a "← All messages" back link and the action
                bar. A screen reader gets no page-title announcement at all
                on navigating in. This component doesn't load the other
                participant's name (only message content), so rather than
                fabricate one, this mirrors PageMeta's own "Conversation"
                title above - visually hidden so the existing header layout
                is untouched. */}
            <h1 className="sr-only">Conversation</h1>
            <div className="flex items-center justify-between mb-2 gap-2">
                <Link to="/messages" className="text-sm text-teal hover:underline inline-block shrink-0">
                    ← {t("chat.allMessages")}
                </Link>

                {!confirmingClear && !confirmingDelete && (
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setSearchOpen((v) => !v)}
                            className="text-xs text-ash hover:text-ink transition-colors"
                            aria-label={t("chat.searchAria")}
                        >
                            {t("chat.search")}
                        </button>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setWallpaperPickerOpen((v) => !v)}
                                className="text-xs text-ash hover:text-ink transition-colors"
                                aria-label={t("chat.wallpaperAria")}
                            >
                                {t("chat.wallpaper")}
                            </button>
                            {wallpaperPickerOpen && (
                                <ChatWallpaperPicker
                                    activeId={wallpaperId}
                                    onSelect={handleSelectWallpaper}
                                    onClose={() => setWallpaperPickerOpen(false)}
                                />
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setConfirmingClear(true)}
                            className="text-xs text-ash hover:text-coral transition-colors"
                        >
                            {t("chat.clearChat")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmingDelete(true)}
                            className="text-xs text-ash hover:text-coral transition-colors"
                        >
                            {t("chat.deleteChat")}
                        </button>
                    </div>
                )}

                {confirmingClear && (
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-ash">{t("chat.clearForYou")}</span>
                        <button
                            type="button"
                            onClick={handleClearChat}
                            disabled={clearing}
                            className="text-coral font-medium hover:underline disabled:opacity-60"
                        >
                            {clearing ? t("chat.clearing") : t("chat.confirmClear")}
                        </button>
                        <button type="button" onClick={() => setConfirmingClear(false)} className="text-ash hover:text-ink">
                            {t("common.cancel")}
                        </button>
                    </div>
                )}

                {confirmingDelete && (
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-ash">{t("chat.deleteConversationConfirm")}</span>
                        <button
                            type="button"
                            onClick={handleDeleteChat}
                            disabled={deletingChat}
                            className="text-coral font-medium hover:underline disabled:opacity-60"
                        >
                            {deletingChat ? t("chat.deleting") : t("chat.confirmDelete")}
                        </button>
                        <button type="button" onClick={() => setConfirmingDelete(false)} className="text-ash hover:text-ink">
                            {t("common.cancel")}
                        </button>
                    </div>
                )}
            </div>

            {searchOpen && (
                <MessageSearch conversationId={id} onJumpTo={jumpToMessage} onClose={() => setSearchOpen(false)} />
            )}

            <div
                className={`flex-1 overflow-y-auto space-y-3 pb-4 rounded-lg transition-colors ${wallpaper.className}`}
                style={wallpaper.style || undefined}
            >
                {messages.length === 0 && (
                    loadFailed ? (
                        // Phase 8 sub-phase 3: a failed history fetch previously
                        // rendered identically to a brand-new, empty conversation
                        // (see loadFailed above) - this gets its own coral-toned
                        // state with a retry, consistent with ErrorState elsewhere
                        // in the app, rather than looking like nothing was ever said.
                        <div className="flex flex-col items-center justify-center text-center px-6 py-16" role="alert">
                            <div className="w-14 h-14 rounded-full bg-coral/10 flex items-center justify-center mb-3" aria-hidden="true">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-coral">
                                    <circle cx="12" cy="12" r="9" />
                                    <path d="M12 8v5" />
                                    <path d="M12 16h.01" />
                                </svg>
                            </div>
                            <p className="text-sm text-ink font-medium mb-3">{t("chat.loadError")}</p>
                            <button type="button" onClick={loadMessages} className="text-xs font-medium text-teal hover:underline">
                                Try again
                            </button>
                        </div>
                    ) : (
                        // Genuinely empty (new) conversation - the violet-azure
                        // gradient badge echoes the "mine" bubble/send-button
                        // branding from sub-phases 1-2 instead of a flat neutral
                        // circle, so this reads as an on-brand invitation to say
                        // something rather than a generic "nothing here" notice.
                        <div className="flex flex-col items-center justify-center text-center px-6 py-16" role="status">
                            <div
                                className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                                style={{
                                    background: "linear-gradient(135deg, #7C3AED 0%, #1D4ED8 100%)",
                                    boxShadow: "0 6px 20px -4px rgba(124,58,237,0.35)"
                                }}
                                aria-hidden="true"
                            >
                                <ChatIcon className="w-6 h-6 text-frost" />
                            </div>
                            <p className="text-sm text-ash">{t("chat.noMessages")}</p>
                        </div>
                    )
                )}

                {messages.map((m, i) => {
                    const showDateSeparator = i === 0 || !isSameDay(m.created_at, messages[i - 1].created_at);
                    return (
                        <Fragment key={m.id}>
                            {showDateSeparator && <DateSeparator label={dateSeparatorLabel(m.created_at)} />}
                            <MessageBubble
                                message={m}
                                mine={m.sender_id === user.id}
                                highlighted={highlightedId === m.id}
                                onReact={handleReact}
                                onRemoveReaction={handleRemoveReaction}
                                onDeleteMessage={handleDeleteMessage}
                                onOpenLightbox={setLightboxSrc}
                            />
                        </Fragment>
                    );
                })}

                {otherTyping && <TypingIndicator />}

                <div ref={bottomRef} />
            </div>

            {error && <p role="alert" className="text-coral text-sm mb-2">{error}</p>}

            {/* Phase 8 sub-phase 2 (input bar & attachments, premium dark/glassy
                direction): the attachment preview and composer both move onto
                the same frosted-glass surface as sub-phase 1's bubbles
                (glass-strong, already used elsewhere in the app), rather than
                a plain bordered box and a bare top border. */}
            {attachmentFile && (
                <div className="flex items-center gap-2 glass-strong rounded-2xl px-3 py-2 mb-2 animate-slide-up">
                    <span className="text-xs truncate flex-1 inline-flex items-center gap-1">
                        {attachmentFile.type.startsWith("image/") ? <ImageIcon className="w-3.5 h-3.5 shrink-0" /> : <PaperclipIcon className="w-3.5 h-3.5 shrink-0" />}
                        {attachmentFile.name}
                    </span>
                    {uploadProgress !== null && (
                        <span className="text-[10px] text-ash font-mono">{uploadProgress}%</span>
                    )}
                    <button
                        type="button"
                        onClick={() => setAttachmentFile(null)}
                        className="text-ash hover:text-coral text-xs px-1"
                        aria-label={t("chat.removeAttachment")}
                    >
                        ✕
                    </button>
                </div>
            )}

            <form
                onSubmit={handleSend}
                className="flex items-center gap-2 glass-strong rounded-full pl-2 pr-2 py-2 mb-[env(safe-area-inset-bottom)]"
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
                    className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-paper border border-line/60 text-ash shadow-btn-icon-rest transition-all duration-150 ease-out hover:text-ink hover:-translate-y-0.5 hover:shadow-btn-icon-hover active:translate-y-0 active:shadow-btn-icon-active"
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
                    className="flex-1 min-w-0 bg-transparent rounded-full px-2 py-2 text-base focus-ring"
                />
                {/* Custom send button rather than the shared <Button> - this
                    should read as part of the chat surface (violet-azure
                    gradient matching the "mine" bubble/glow), not the
                    warm/mango purchase-CTA color <Button> uses everywhere
                    else, and <Button> is shared across 45+ places so isn't
                    touched here. */}
                <button
                    type="submit"
                    disabled={sending || (!draft.trim() && !attachmentFile)}
                    aria-label={sending ? "Sending…" : "Send message"}
                    className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-frost transition-all duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:pointer-events-none"
                    style={{
                        background: "linear-gradient(135deg, #7C3AED 0%, #1D4ED8 100%)",
                        boxShadow: "0 6px 20px -4px rgba(124,58,237,0.4), inset 0 1px 0 rgba(255,255,255,0.12)"
                    }}
                >
                    {sending ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
                            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M4 12h15.5M13 5.5 20 12l-7 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </button>
            </form>

            <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
        </div>
    );
}
