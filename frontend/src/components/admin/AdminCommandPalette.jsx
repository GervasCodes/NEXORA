import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// Ctrl+K / Cmd+K jump-to-page palette for the Control room (Phase 8).
// `items` is [{ to, label, group }]. Matching is a case-insensitive "every
// word appears in the label or group" check, so "ver" finds Verifications
// and "fraud dash" finds Fraud dashboard.
export default function AdminCommandPalette({ open, onClose, items }) {
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const inputRef = useRef(null);
    const navigate = useNavigate();

    const results = useMemo(() => {
        const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
        if (terms.length === 0) return items;
        return items.filter((item) => {
            const haystack = `${item.label} ${item.group}`.toLowerCase();
            return terms.every((term) => haystack.includes(term));
        });
    }, [items, query]);

    // Reset every time the palette opens so the last search doesn't linger.
    useEffect(() => {
        if (!open) return;
        setQuery("");
        setActive(0);
        const frame = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(frame);
    }, [open]);

    useEffect(() => {
        setActive(0);
    }, [query]);

    if (!open) return null;

    const choose = (item) => {
        onClose();
        navigate(item.to);
    };

    const handleKeyDown = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(results.length - 1, i + 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (results[active]) choose(results[active]);
        }
    };

    return (
        <div
            role="presentation"
            className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-ink/40"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Jump to a Control room page"
                className="w-full max-w-lg bg-paper rounded-xl border border-line shadow-xl overflow-hidden"
            >
                <input
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="admin-palette-list"
                    aria-autocomplete="list"
                    aria-activedescendant={results[active] ? `admin-palette-opt-${active}` : undefined}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Jump to a page…"
                    className="w-full px-4 py-3 text-sm bg-transparent border-b border-line focus:outline-none"
                />
                <ul id="admin-palette-list" role="listbox" className="max-h-80 overflow-y-auto py-2">
                    {results.length === 0 && <li className="px-4 py-3 text-sm text-ash">No matching pages.</li>}
                    {results.map((item, i) => (
                        <li
                            key={item.to}
                            id={`admin-palette-opt-${i}`}
                            role="option"
                            aria-selected={i === active}
                            onMouseEnter={() => setActive(i)}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                choose(item);
                            }}
                            className={`px-4 py-2 text-sm flex items-center justify-between gap-3 cursor-pointer ${
                                i === active ? "bg-ink text-paper" : ""
                            }`}
                        >
                            <span className="truncate">{item.label}</span>
                            <span className={`text-xs shrink-0 ${i === active ? "text-paper/70" : "text-ash"}`}>{item.group}</span>
                        </li>
                    ))}
                </ul>
                <p className="px-4 py-2 border-t border-line text-[11px] text-ash">↑ ↓ to move · Enter to open · Esc to close</p>
            </div>
        </div>
    );
}
