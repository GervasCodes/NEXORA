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

// Phase 8 sub-phase 1 (bubble & typography pass, see PHASE_8_NOTES
// discussion) - direction confirmed: premium dark/glassy, matching the
// same violet-to-azure brand glow SplashScreen.jsx and
// CookieConsentBanner.jsx already use, with iMessage/WhatsApp/Telegram as
// style references. The "mine" bubble becomes a genuine branded gradient
// with a soft violet glow instead of flat bg-abyss; the other side becomes
// a real frosted-glass card (backdrop-blur + translucent surface, in both
// themes) rather than a flat bg-line fill. Kept theme-aware (light/dark
// variants) rather than forcing the whole thread dark, since
// ChatWallpaperPicker.jsx already lets the person choose the thread's
// background - permanently darkening bubbles regardless of that choice
// would fight it instead of complementing it.
const formatTime = (iso) => {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
        return "";
    }
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
    const time = formatTime(m.created_at);

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
                        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- invisible click-catcher that closes the picker; keyboard users close it by tabbing out or pressing Escape */}
                        <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                        <div className={`absolute -top-11 z-20 ${mine ? "right-0" : "left-0"}`}>
                            <EmojiPicker onSelect={handlePick} myReactions={myReactions} />
                        </div>
                    </>
                )}

                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- long-press gesture to open reactions; the same action is available from the keyboard-reachable react button */}
                <div
                    onMouseDown={!m.is_deleted ? startLongPress : undefined}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={!m.is_deleted ? startLongPress : undefined}
                    onTouchEnd={cancelLongPress}
                    className={`rounded-[20px] px-4 py-2.5 text-[15px] leading-relaxed select-none transition-transform ${
                        m.is_deleted
                            ? "italic text-ash bg-line/30 rounded-bl-[6px]"
                            : mine
                                ? "text-frost rounded-br-[6px] shadow-[0_6px_20px_-4px_rgba(124,58,237,0.35)]"
                                : "text-ink rounded-bl-[6px] backdrop-blur-md bg-paper/70 dark:bg-abyss/45 border border-ink/5 shadow-[0_2px_10px_rgba(0,0,0,0.06)]"
                    } ${hasAttachment && !m.message ? "p-1.5" : ""}`}
                    style={
                        !m.is_deleted && mine
                            ? {
                                  background: "linear-gradient(135deg, #7C3AED 0%, #1D4ED8 100%)",
                                  boxShadow:
                                      "0 6px 20px -4px rgba(124,58,237,0.35), inset 0 1px 0 rgba(255,255,255,0.12)"
                              }
                            : undefined
                    }
                >
                    {m.is_deleted ? (
                        "This message was deleted"
                    ) : (
                        <div className="space-y-1.5">
                            {hasAttachment && (
                                <AttachmentBubble attachment={m} mine={mine} onOpenLightbox={onOpenLightbox} />
                            )}
                            {m.message && <p className="whitespace-pre-wrap break-words">{m.message}</p>}
                            <div className={`flex items-center gap-1 ${mine ? "justify-end" : "justify-start"}`}>
                                {time && (
                                    <span
                                        className={`text-[10px] tabular-nums ${
                                            mine ? "text-frost/60" : "text-ash"
                                        }`}
                                    >
                                        {time}
                                    </span>
                                )}
                                {mine && <ReadReceipt status={receiptStatus(m)} />}
                            </div>
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
