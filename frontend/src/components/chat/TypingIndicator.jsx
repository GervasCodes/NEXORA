export default function TypingIndicator() {
    return (
        <div className="flex justify-start animate-slide-up">
            <div className="bg-line/50 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-ash animate-typing-dot" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-ash animate-typing-dot" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-ash animate-typing-dot" style={{ animationDelay: "300ms" }} />
            </div>
        </div>
    );
}
