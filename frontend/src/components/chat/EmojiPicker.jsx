// Curated reaction set - kept in lockstep with ALLOWED_REACTIONS in
// backend/src/modules/chat/chat.service.js. A small fixed palette (vs. a
// full emoji keyboard) keeps this dependency-free and matches what the
// backend will actually accept.
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"];

export default function EmojiPicker({ onSelect, myReactions = [], className = "" }) {
    return (
        <div
            className={`glass-strong rounded-full shadow-lg px-2 py-1.5 flex items-center gap-1 overflow-x-auto max-w-full animate-pop-in ${className}`}
            role="menu"
            aria-label="React with an emoji"
        >
            {REACTION_EMOJIS.map((emoji) => (
                <button
                    key={emoji}
                    type="button"
                    role="menuitem"
                    onClick={() => onSelect(emoji)}
                    aria-pressed={myReactions.includes(emoji)}
                    className={`text-lg leading-none w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-transform hover:scale-125 active:scale-95 ${
                        myReactions.includes(emoji) ? "bg-mango/20" : "hover:bg-line/40"
                    }`}
                >
                    {emoji}
                </button>
            ))}
        </div>
    );
}
