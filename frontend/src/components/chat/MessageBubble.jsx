import { useRef, useState } from "react";
import AttachmentBubble from "./AttachmentBubble";
import EmojiPicker from "./EmojiPicker";
import ReadReceipt from "./ReadReceipt";
import { SmileyIcon } from "../Icons";

const LONG_PRESS_MS = 400;

const receiptStatus = (message) => {
    if (message.read_at) return "read";
    if (message.delivered_at) return "delivered";
    return "sent";
};

export default function MessageBubble({
    message: m,
    mine,
    highlighted,
    onReact,
    onRemoveReaction,
    onDeleteMessage,
    onOpenLightbox
}) {
    const [openMenuId, setOpenMenuId] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const pressTimer = useRef(null);

    const startLongPress = () => {
        pressTimer.current = setTimeout(() => setPickerOpen(true), LONG_PRESS_MS);
    };
    const cancelLongPress = () => {
        if (pressTimer.current) clearTimeout(pressTimer.current);
    };

    const myReactions = (m.reactions || []).filter((r) => r.mine).map((r) => r.emoji);

    const handlePick = (emoji) => {
        setPickerOpen(false);
        if (myReactions.includes(emoji)) {
            onRemoveReaction(m.id, emoji);
        } else {
            onReact(m.id, emoji);
        }
    };

    const hasAttachment = !!m.attachment_url;

    return (
        <div
            id={`message-${m.id}`}
            className={`group relative flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"} ${
                highlighted ? "animate-pop-in" : ""
            }`}
        >
            {mine && !m.is_deleted && (
                <div className="relative shrink-0 self-center">
                    <button
                        type="button"
                        onClick={() => setOpenMenuId((v) => !v)}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-ash hover:text-ink transition-opacity px-1"
                        aria-label="Message options"
                    >
                        ⋮
                    </button>
                    {openMenuId && (
                        <div className="absolute right-0 bottom-full mb-1 glass-strong rounded-md shadow-lg py-1 z-10 whitespace-nowrap animate-scale-in">
                            <button
                                type="button"
                                onClick={() => {
                                    setOpenMenuId(false);
                                    onDeleteMessage(m.id);
                                }}
                                className="block w-full text-left px-3 py-1.5 text-xs text-coral hover:bg-coral/10 transition-colors"
                            >
                                Delete message
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="relative max-w-[75%]">
                {pickerOpen && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                        <div className={`absolute -top-11 z-20 ${mine ? "right-0" : "left-0"}`}>
                            <EmojiPicker onSelect={handlePick} myReactions={myReactions} />
                        </div>
                    </>
                )}

                <div
                    onMouseDown={!m.is_deleted ? startLongPress : undefined}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={!m.is_deleted ? startLongPress : undefined}
                    onTouchEnd={cancelLongPress}
                    className={`rounded-2xl px-4 py-2 text-sm select-none transition-transform ${
                        m.is_deleted
                            ? "italic text-ash bg-line/30 rounded-bl-sm"
                            : mine
                                ? "bg-abyss text-frost rounded-br-sm"
                                : "bg-line/50 text-ink rounded-bl-sm"
                    } ${hasAttachment && !m.message ? "p-1.5" : ""}`}
                >
                    {m.is_deleted ? (
                        "This message was deleted"
                    ) : (
                        <div className="space-y-1.5">
                            {hasAttachment && (
                                <AttachmentBubble attachment={m} mine={mine} onOpenLightbox={onOpenLightbox} />
                            )}
                            {m.message && <p className="whitespace-pre-wrap break-words">{m.message}</p>}
                            {mine && (
                                <div className="flex justify-end">
                                    <ReadReceipt status={receiptStatus(m)} />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {m.reactions?.length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1 ${mine ? "justify-end" : "justify-start"}`}>
                        {m.reactions.map((r) => (
                            <button
                                key={r.emoji}
                                type="button"
                                onClick={() => (r.mine ? onRemoveReaction(m.id, r.emoji) : onReact(m.id, r.emoji))}
                                className={`animate-pop-in text-[11px] rounded-full px-1.5 py-0.5 border flex items-center gap-1 transition-colors ${
                                    r.mine
                                        ? "bg-mango/20 border-mango/40"
                                        : "bg-line/30 border-line hover:bg-line/50"
                                }`}
                            >
                                <span>{r.emoji}</span>
                                <span className="text-ash">{r.count}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {!mine && !m.is_deleted && (
                <button
                    type="button"
                    onClick={() => setPickerOpen((v) => !v)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-ash hover:text-ink transition-opacity px-1 self-center"
                    aria-label="React"
                >
                    <SmileyIcon className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}
