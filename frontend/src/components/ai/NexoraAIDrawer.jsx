import { useEffect, useRef, useState } from "react";
import { useAIAssistant } from "../../context/AIAssistantContext";
import { sendChatMessage, explainOrderStatus } from "../../api/ai";

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

// AI sparkle icon inline
function SparkleIcon({ className = "w-4 h-4" }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M12 3v3M12 18v3M4.2 12H3M21 12h-1.2M6 6l1.5 1.5M18 18l-1.5-1.5M18 6l-1.5 1.5M6 18l1.5-1.5" />
            <circle cx="12" cy="12" r="4" />
        </svg>
    );
}

export default function NexoraAIDrawer() {
    const assistant = useAIAssistant();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);

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
                    setMessages([{ role: "assistant", text: "I couldn't load that order's status right now — please check the Orders page directly.", aiGenerated: false }]);
                })
                .finally(() => setSending(false));
        } else {
            setMessages([{ role: "assistant", text: "Hi! I'm Nexora AI. Ask me about orders, delivery, refunds, or finding a product.", aiGenerated: false }]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }, [messages, sending]);

    // Focus input when drawer opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 200);
        }
    }, [isOpen]);

    if (!assistant || !isOpen) return null;

    const handleSend = async (e) => {
        e.preventDefault();
        const text = input.trim();
        if (!text || sending) return;

        setMessages((prev) => [...prev, { role: "user", text }]);
        setInput("");
        setSending(true);
        try {
            const result = await sendChatMessage(text);
            setMessages((prev) => [...prev, { role: "assistant", text: result.reply, aiGenerated: result.aiGenerated }]);
        } catch {
            setMessages((prev) => [...prev, {
                role: "assistant",
                text: "Nexora AI is temporarily unavailable — please try again or reach out to support from your Account page.",
                aiGenerated: false,
                error: true
            }]);
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend(e);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-end">
            {/* Backdrop */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div
                className="absolute inset-0 bg-abyss/50 backdrop-blur-sm"
                onClick={assistant.close}
                aria-hidden="true"
            />

            {/* Drawer panel */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Nexora AI"
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
                            <SparkleIcon className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <p className="font-semibold text-sm text-ink leading-tight">Nexora AI</p>
                            <p className="text-[10px] text-azure/80 uppercase tracking-widest leading-tight">Always here to help</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={assistant.close}
                        aria-label="Close Nexora AI"
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
                                    <SparkleIcon className="w-3 h-3 text-white" />
                                </div>
                            )}
                            <div
                                className={`
                                    max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap
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
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {sending && (
                        <div className="flex justify-start">
                            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-azure-light to-azure-deep flex items-center justify-center shrink-0 mr-2 mt-0.5 shadow-sm">
                                <SparkleIcon className="w-3 h-3 text-white" />
                            </div>
                            <div className="bg-line/30 rounded-2xl rounded-tl-sm">
                                <TypingDots />
                            </div>
                        </div>
                    )}

                    <div ref={bottomRef} />
                </div>

                {/* Suggested prompts — shown before first user message */}
                {messages.length <= 1 && !sending && (
                    <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-none shrink-0">
                        {["Where's my order?", "How do I return?", "Find me a product"].map((prompt) => (
                            <button
                                key={prompt}
                                type="button"
                                onClick={() => {
                                    setInput(prompt);
                                    inputRef.current?.focus();
                                }}
                                className="shrink-0 text-xs border border-azure/30 text-azure px-3 py-1.5 rounded-full hover:bg-azure/8 transition-colors whitespace-nowrap"
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                )}

                {/* Input */}
                <form
                    onSubmit={handleSend}
                    className="flex items-end gap-2 p-3 border-t border-line/60 shrink-0 bg-paper/50"
                >
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask Nexora AI…"
                        maxLength={1000}
                        rows={1}
                        className="
                            flex-1 rounded-xl bg-line/20 border border-line/60
                            px-3.5 py-2.5 text-sm outline-none resize-none
                            focus:border-azure/60 focus:bg-paper
                            transition-colors placeholder:text-ash
                            max-h-24 overflow-y-auto
                        "
                    />
                    <button
                        type="submit"
                        disabled={sending || !input.trim()}
                        aria-label="Send"
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
