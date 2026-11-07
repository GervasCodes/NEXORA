import { useEffect, useRef, useState } from "react";
import { useAIAssistant } from "../../context/AIAssistantContext";
import { useLanguage } from "../../context/LanguageContext";
import { sendChatMessage, explainOrderStatus, explainProduct, explainBooking } from "../../api/ai";
import AssistantSparkleIcon from "./AssistantSparkleIcon";

// Typing dots animation for "thinking" state
function TypingDots() {
    return (
        <div className="flex items-center gap-1 px-3 py-2.5">
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-azure/60 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
                />
            ))}
        </div>
    );
}


// Maps ai.service.js#chat's unavailableReason (only ever set when the
// spend guard specifically blocked the call, never for any other kind
// of AI-unavailable case) to a short note shown under the fallback
// bubble. Any other/missing reason renders no extra note.
// Values are i18n keys (assistant.note.*), resolved with t() at render.
const UNAVAILABLE_REASON_NOTES = {
    AI_DISABLED: "assistant.note.disabled",
    USER_DAILY_CAP: "assistant.note.dailyCap",
    GLOBAL_DAILY_CAP: "assistant.note.dailyCap",
    USER_MONTHLY_CAP: "assistant.note.monthlyCap",
    GLOBAL_MONTHLY_CAP: "assistant.note.monthlyCap"
};

// Topic ids the backend may return in `suggestedTopics` (see backend
// knowledge/fallback.js#SUGGESTED_TOPIC_IDS). Each has i18n keys
// assistant.topic.<id>.label and assistant.topic.<id>.question; tapping
// the button sends that question. Unknown ids from the server are ignored.
const TOPIC_IDS = ["track_order", "refunds", "payments", "cancel_order", "become_seller", "support"];

export default function NexoraAIDrawer() {
    const assistant = useAIAssistant();
    const { t, language } = useLanguage();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);
    const panelRef = useRef(null);
    const openerRef = useRef(null);

    const isOpen = Boolean(assistant?.isOpen);

    // Load initial context when drawer opens
    useEffect(() => {
        if (!isOpen) return;
        setMessages([]);
        const context = assistant.pendingContext;

        if (context?.type === "order") {
            setSending(true);
            explainOrderStatus(context.orderId)
                .then((result) => {
                    setMessages([{ role: "assistant", text: result.explanation, aiGenerated: result.aiGenerated }]);
                })
                .catch(() => {
                    setMessages([{ role: "assistant", text: t("assistant.error.order"), aiGenerated: false }]);
                })
                .finally(() => setSending(false));
        } else if (context?.type === "product") {
            setSending(true);
            explainProduct(context.slug)
                .then((result) => {
                    setMessages([{ role: "assistant", text: result.explanation, aiGenerated: result.aiGenerated }]);
                })
                .catch(() => {
                    setMessages([{ role: "assistant", text: t("assistant.error.product"), aiGenerated: false }]);
                })
                .finally(() => setSending(false));
        } else if (context?.type === "booking") {
            setSending(true);
            explainBooking(context.bookingId)
                .then((result) => {
                    setMessages([{ role: "assistant", text: result.explanation, aiGenerated: result.aiGenerated }]);
                })
                .catch(() => {
                    setMessages([{ role: "assistant", text: t("assistant.error.booking"), aiGenerated: false }]);
                })
                .finally(() => setSending(false));
        } else {
            setMessages([{ role: "assistant", text: t("assistant.welcome"), aiGenerated: false, suggestedTopics: TOPIC_IDS }]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }, [messages, sending]);

    // Focus input when drawer opens; remember + restore the trigger element
    // so keyboard/screen-reader users land back where they opened it from,
    // not at the top of the page (same pattern ConfirmDialog/SideDrawer use).
    useEffect(() => {
        if (isOpen) {
            openerRef.current = document.activeElement;
            setTimeout(() => inputRef.current?.focus(), 200);
        } else if (openerRef.current) {
            openerRef.current.focus?.();
            openerRef.current = null;
        }
    }, [isOpen]);

    if (!assistant || !isOpen) return null;

    const handleSend = (e) => {
        e.preventDefault();
        return sendText(input.trim());
    };

    // Shared by the form and the suggested-topic buttons.
    const sendText = async (text) => {
        if (!text || sending) return;

        // Existing messages state, mapped to the {role, content} shape
        // sendChatMessage/ai.service.js expect - captured before the
        // just-added user message below, which goes as `message` itself.
        const history = messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.text }));

        setMessages((prev) => [...prev, { role: "user", text }]);
        setInput("");
        setSending(true);
        try {
            const result = await sendChatMessage(text, { history, language });
            setMessages((prev) => [...prev, {
                role: "assistant",
                text: result.reply,
                aiGenerated: result.aiGenerated,
                truncated: result.truncated,
                unavailableReason: result.unavailableReason,
                suggestedTopics: Array.isArray(result.suggestedTopics) ? result.suggestedTopics : [],
                sourceQuestion: text
            }]);
        } catch {
            setMessages((prev) => [...prev, {
                role: "assistant",
                text: t("assistant.error.unavailable"),
                aiGenerated: false,
                error: true
            }]);
        } finally {
            setSending(false);
        }
    };

    // Re-sends the same question with the prior (truncated) reply passed
    // back as assistant context, so the model continues instead of
    // starting over - ai.service.js#chat doubles maxTokens for this one
    // follow-up call. Appends to the existing bubble rather than
    // starting a new one.
    const handleShowMore = async (index) => {
        const message = messages[index];
        if (!message || message.loadingMore) return;

        setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, loadingMore: true } : m)));
        try {
            const result = await sendChatMessage(message.sourceQuestion, { priorReply: message.text, language });
            setMessages((prev) => prev.map((m, i) => (i === index
                ? {
                    ...m,
                    text: result.reply ? `${m.text} ${result.reply}` : m.text,
                    truncated: result.truncated,
                    unavailableReason: result.unavailableReason,
                    loadingMore: false
                }
                : m)));
        } catch {
            setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, loadingMore: false } : m)));
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend(e);
        }
    };

    // Keep Tab/Shift+Tab cycling within the drawer panel, and let Escape
    // close it - standard dialog focus-trap behavior, matching aria-modal.
    const handlePanelKeyDown = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            assistant.close();
            return;
        }
        if (e.key !== "Tab" || !panelRef.current) return;
        const focusable = panelRef.current.querySelectorAll(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    return (
        <div className="fixed inset-0 z-[var(--z-drawer)] flex items-end sm:items-center sm:justify-end">
            {/* Backdrop */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div
                className="absolute inset-0 bg-abyss/50 backdrop-blur-sm"
                onClick={assistant.close}
                aria-hidden="true"
            />

            {/* Drawer panel */}
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={t("assistant.title")}
                onKeyDown={handlePanelKeyDown}
                className="
                    relative w-full sm:w-[400px] sm:mr-6 sm:mb-6
                    h-[80vh] sm:h-[600px]
                    rounded-t-2xl sm:rounded-2xl
                    flex flex-col overflow-hidden
                    shadow-2xl shadow-abyss/40
                    border border-line/60
                    bg-paper
                "
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-line/60 shrink-0 bg-gradient-to-r from-azure/8 to-transparent">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-azure-light to-azure-deep flex items-center justify-center shadow-sm">
                            <AssistantSparkleIcon className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <p className="font-semibold text-sm text-ink leading-tight">{t("assistant.title")}</p>
                            <p className="text-[10px] text-azure/80 uppercase tracking-widest leading-tight">{t("assistant.tagline")}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={assistant.close}
                        aria-label={t("assistant.close")}
                        className="w-11 h-11 flex items-center justify-center rounded-lg text-ash hover:text-ink hover:bg-line/50 transition-colors"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
                            <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                            {m.role === "assistant" && (
                                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-azure-light to-azure-deep flex items-center justify-center shrink-0 mr-2 mt-1 shadow-sm">
                                    <AssistantSparkleIcon className="w-3 h-3 text-white" />
                                </div>
                            )}
                            <div className="flex flex-col max-w-[80%] items-start">
                                <div
                                    className={`
                                        rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap
                                        ${m.role === "user"
                                            ? "bg-gradient-to-br from-azure-light to-azure-deep text-white rounded-tr-sm shadow-sm shadow-azure/20"
                                            : m.error
                                                ? "bg-coral/10 text-coral border border-coral/20 rounded-tl-sm"
                                                : "bg-line/30 text-ink rounded-tl-sm"
                                        }
                                    `}
                                >
                                    {m.text}
                                </div>
                                {m.role === "assistant" && m.truncated && (
                                    <button
                                        type="button"
                                        onClick={() => handleShowMore(i)}
                                        disabled={m.loadingMore}
                                        className="mt-1 ml-1 text-xs text-azure hover:underline disabled:opacity-50 disabled:cursor-wait"
                                    >
                                        {m.loadingMore ? t("assistant.loadingMore") : t("assistant.showMore")}
                                    </button>
                                )}
                                {m.role === "assistant" && UNAVAILABLE_REASON_NOTES[m.unavailableReason] && (
                                    <p className="mt-1 ml-1 text-xs text-ash">
                                        {t(UNAVAILABLE_REASON_NOTES[m.unavailableReason])}
                                    </p>
                                )}
                                {m.role === "assistant" && i === messages.length - 1 && !sending && Array.isArray(m.suggestedTopics) && (
                                    <div role="group" aria-label={t("assistant.topics.heading")} className="mt-2 flex flex-wrap gap-2">
                                        {m.suggestedTopics.filter((id) => TOPIC_IDS.includes(id)).map((id) => (
                                            <button
                                                key={id}
                                                type="button"
                                                onClick={() => sendText(t(`assistant.topic.${id}.question`))}
                                                className="text-xs border border-azure/30 text-azure px-3 py-2 rounded-full hover:bg-azure/8 transition-colors text-left"
                                            >
                                                {t(`assistant.topic.${id}.label`)}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {sending && (
                        <div className="flex justify-start">
                            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-azure-light to-azure-deep flex items-center justify-center shrink-0 mr-2 mt-0.5 shadow-sm">
                                <AssistantSparkleIcon className="w-3 h-3 text-white" />
                            </div>
                            <div className="bg-line/30 rounded-2xl rounded-tl-sm">
                                <TypingDots />
                            </div>
                        </div>
                    )}

                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <form
                    onSubmit={handleSend}
                    className="flex items-end gap-2 p-3 border-t border-line/60 shrink-0 bg-paper/50"
                >
                    <div className="flex-1 min-w-0">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={t("assistant.placeholder")}
                            maxLength={1000}
                            rows={1}
                            className="
                                w-full rounded-xl bg-line/20 border border-line/60
                                px-3.5 py-2.5 text-sm outline-none resize-none
                                focus:border-azure/60 focus:bg-paper
                                transition-colors placeholder:text-ash
                                max-h-24 overflow-y-auto
                            "
                        />
                        <p className="text-[11px] text-ash text-right mt-0.5 pr-1">
                            {input.length}/1000
                        </p>
                    </div>
                    <button
                        type="submit"
                        disabled={sending || !input.trim()}
                        aria-label={t("assistant.send")}
                        className="
                            w-10 h-10 flex items-center justify-center shrink-0
                            rounded-xl bg-gradient-to-br from-azure-light to-azure-deep
                            text-white shadow-sm shadow-azure/25
                            hover:opacity-90 active:scale-95
                            disabled:opacity-40 disabled:cursor-not-allowed
                            transition-all duration-150
                        "
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                            <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z" />
                        </svg>
                    </button>
                </form>
            </div>
        </div>
    );
}
