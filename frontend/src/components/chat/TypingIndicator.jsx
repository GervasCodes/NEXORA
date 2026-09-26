// Phase 8 sub-phase 1 (bubble & typography pass): matches the redesigned
// "other" message bubble's frosted-glass treatment (MessageBubble.jsx) so
// the typing indicator reads as the same surface, not a leftover flat
// bg-line chip next to the new glass bubbles.
export default function TypingIndicator() {
    return (
        <div className="flex justify-start animate-slide-up">
            <div className="backdrop-blur-md bg-paper/70 dark:bg-abyss/45 border border-ink/5 shadow-[0_2px_10px_rgba(0,0,0,0.06)] rounded-[20px] rounded-bl-[6px] px-4 py-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-ash animate-typing-dot" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-ash animate-typing-dot" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-ash animate-typing-dot" style={{ animationDelay: "300ms" }} />
            </div>
        </div>
    );
}
