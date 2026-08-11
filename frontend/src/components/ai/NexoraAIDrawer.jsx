import { useEffect, useRef, useState } from "react";
import { useAIAssistant } from "../../context/AIAssistantContext";
import { sendChatMessage, explainOrderStatus } from "../../api/ai";

// Opens as a dismissible overlay - never resizes/shrinks the page
// behind it (fixed position, page underneath is untouched), per the
// roadmap's placement rules.
export default function NexoraAIDrawer() {
    const assistant = useAIAssistant();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const bottomRef = useRef(null);

    const isOpen = Boolean(assistant?.isOpen);

    // A page can open the drawer with a context (currently: an order to
    // explain) - handled once per open rather than on every render.
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
                    setMessages([{ role: "assistant", text: "I couldn't load that order's status right now - please check the Orders page directly.", aiGenerated: false }]);
                })
                .finally(() => setSending(false));
        } else {
            setMessages([{ role: "assistant", text: "Hi, I'm Nexora AI - ask me about orders, delivery, refunds, or finding a product.", aiGenerated: false }]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }, [messages, sending]);

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
                text: "Nexora AI is temporarily unavailable - please try again in a moment, or reach out to support from your Account page.",
                aiGenerated: false
            }]);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-end">
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div className="absolute inset-0 bg-abyss/40" onClick={assistant.close} aria-hidden="true" />

            <div
                role="dialog"
                aria-modal="true"
                aria-label="Nexora AI"
                className="relative w-full sm:w-[380px] sm:mr-6 sm:mb-6 h-[75vh] sm:h-[560px] sm:rounded-2xl rounded-t-2xl
                           glass-strong flex flex-col overflow-hidden shadow-2xl"
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-line/60 shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-full bg-gradient-to-br from-azure-light to-azure-deep" />
                        <span className="font-display text-sm font-semibold text-abyss">Nexora AI</span>
                    </div>
                    <button type="button" onClick={assistant.close} aria-label="Close Nexora AI" className="text-ash hover:text-abyss px-2 py-1">
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div
                                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                                    m.role === "user" ? "bg-azure text-white" : "bg-frost text-abyss"
                                }`}
                            >
                                {m.text}
                            </div>
                        </div>
                    ))}
                    {sending && (
                        <div className="flex justify-start">
                            <div className="bg-frost text-ash rounded-xl px-3 py-2 text-sm">Thinking…</div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                <form onSubmit={handleSend} className="flex items-center gap-2 p-3 border-t border-line/60 shrink-0">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask Nexora AI..."
                        maxLength={1000}
                        className="flex-1 rounded-full bg-white/70 border border-line/60 px-4 py-2 text-sm outline-none focus:border-azure"
                    />
                    <button
                        type="submit"
                        disabled={sending || !input.trim()}
                        className="rounded-full bg-gradient-to-br from-azure-light to-azure-deep text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                    >
                        Send
                    </button>
                </form>
            </div>
        </div>
    );
}
