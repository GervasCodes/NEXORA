import { useState } from "react";

// Collapsible dashboard section (Phase 8). The header is always visible and
// is the toggle; the body unmounts when closed so charts you aren't looking
// at don't keep re-rendering on live socket refreshes.
export default function CollapsibleSection({ id, title, subtitle, defaultOpen = true, actions, children }) {
    const [open, setOpen] = useState(defaultOpen);
    const bodyId = `section-${id}`;

    return (
        <section className="mb-10">
            <div className="flex items-center justify-between gap-3 mb-4">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-controls={bodyId}
                    className="flex items-center gap-2 text-left focus-ring rounded-md"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`w-4 h-4 text-ash transition-transform ${open ? "" : "-rotate-90"}`}
                        aria-hidden="true"
                    >
                        <path d="m6 9 6 6 6-6" />
                    </svg>
                    <span>
                        <span className="block font-display text-xl">{title}</span>
                        {subtitle && <span className="block text-xs text-ash">{subtitle}</span>}
                    </span>
                </button>
                {open && actions}
            </div>
            {open && <div id={bodyId}>{children}</div>}
        </section>
    );
}
