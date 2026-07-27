import { useEffect, useState } from "react";
import api from "../../api/client";

// Debounce so every keystroke doesn't fire a request.
const DEBOUNCE_MS = 300;

export default function MessageSearch({ conversationId, onJumpTo, onClose }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const trimmed = query.trim();
        if (!trimmed) {
            setResults([]);
            return undefined;
        }

        // Guards against out-of-order responses: if the query changes again
        // before this request resolves, the cleanup below flips `cancelled`
        // so a slower, now-stale response can never overwrite newer results.
        let cancelled = false;

        setLoading(true);
        const handle = setTimeout(() => {
            api
                .get(`/chat/conversations/${conversationId}/search`, { params: { q: trimmed } })
                .then(({ data }) => {
                    if (!cancelled) setResults(data.data);
                })
                .catch(() => {
                    if (!cancelled) setResults([]);
                })
                .finally(() => {
                    if (!cancelled) setLoading(false);
                });
        }, DEBOUNCE_MS);

        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
    }, [query, conversationId]);

    return (
        <div className="glass-strong rounded-xl shadow-lg animate-slide-down mb-3 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-ash shrink-0">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                    <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search this conversation…"
                    className="flex-1 text-sm bg-transparent outline-none"
                />
                <button type="button" onClick={onClose} className="text-ash hover:text-ink text-sm px-1">
                    Close
                </button>
            </div>

            {query.trim() && (
                <div className="max-h-64 overflow-y-auto">
                    {loading && <p className="text-xs text-ash px-3 py-3">Searching…</p>}
                    {!loading && results.length === 0 && (
                        <p className="text-xs text-ash px-3 py-3">No messages match "{query.trim()}".</p>
                    )}
                    {!loading &&
                        results.map((r) => (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() => onJumpTo(r.id)}
                                className="block w-full text-left px-3 py-2 text-xs hover:bg-line/30 transition-colors border-b border-line last:border-0"
                            >
                                <p className="truncate text-ink">
                                    {r.message || (r.attachment_name ? `📎 ${r.attachment_name}` : "Attachment")}
                                </p>
                                <p className="text-ash text-[10px] mt-0.5">
                                    {new Date(r.created_at).toLocaleString()}
                                </p>
                            </button>
                        ))}
                </div>
            )}
        </div>
    );
}
