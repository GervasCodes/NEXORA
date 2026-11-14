import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useLanguage, LANGUAGES } from "../context/LanguageContext";
import FlagIcon from "./FlagIcon";

// Language picker.
//
// Desktop (default): a plain nav item - flag + code + chevron - styled like
// the other header controls (same height, radius and hover). Clicking it
// opens a dropdown listing every language in LANGUAGES with its flag; the
// active one is checked. Adding a language is one entry in LANGUAGES.
//
// variant="row": the same choice for the mobile drawer, as a normal list
// row that expands in place instead of floating over the page.

function Chevron({ open }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ease-out ${open ? "rotate-180" : ""}`}
        >
            <path d="m6 9 6 6 6-6" />
        </svg>
    );
}

function Check() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="w-4 h-4 shrink-0"
        >
            <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
    );
}

export default function LanguageToggle({ variant = "nav", className = "" }) {
    const { language, setLanguage, t } = useLanguage();
    const location = useLocation();
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const optionRefs = useRef([]);

    const current = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];
    const menuLabel = t("language.menuLabel");

    // Close on outside click, like ToolsMenu.
    useEffect(() => {
        const onMouseDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, []);

    // Close on navigation.
    useEffect(() => {
        setOpen(false);
    }, [location.pathname]);

    // Move focus to the active option when the menu opens so arrow keys work
    // straight away.
    useEffect(() => {
        if (!open) return;
        const idx = Math.max(0, LANGUAGES.findIndex((l) => l.code === language));
        optionRefs.current[idx]?.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const choose = (code) => {
        setLanguage?.(code);
        setOpen(false);
        triggerRef.current?.focus();
    };

    const onMenuKeyDown = (e) => {
        const count = LANGUAGES.length;
        const idx = optionRefs.current.findIndex((el) => el === document.activeElement);
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            triggerRef.current?.focus();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            optionRefs.current[(idx + 1) % count]?.focus();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            optionRefs.current[(idx - 1 + count) % count]?.focus();
        } else if (e.key === "Home") {
            e.preventDefault();
            optionRefs.current[0]?.focus();
        } else if (e.key === "End") {
            e.preventDefault();
            optionRefs.current[count - 1]?.focus();
        } else if (e.key === "Tab") {
            setOpen(false);
        }
    };

    const onTriggerKeyDown = (e) => {
        if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
        }
    };

    const options = LANGUAGES.map((l, i) => {
        const active = l.code === language;
        return (
            <button
                key={l.code}
                ref={(el) => { optionRefs.current[i] = el; }}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                lang={l.code}
                onClick={() => choose(l.code)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-md text-sm whitespace-nowrap text-left transition-colors duration-150 focus-ring
                    ${active ? "bg-teal/10 text-teal font-medium" : "hover:bg-line/20"}`}
            >
                <FlagIcon flag={l.flag} />
                <span className="flex-1">{l.label}</span>
                {active && <Check />}
            </button>
        );
    });

    if (variant === "row") {
        return (
            <div ref={rootRef} className={className}>
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-controls="language-row-options"
                    className="w-full py-3 flex items-center gap-3 text-left text-sm font-medium whitespace-nowrap transition-colors duration-150 hover:text-teal focus-ring"
                >
                    <FlagIcon flag={current.flag} className="w-[18px] h-[13px]" />
                    <span className="flex-1">{menuLabel}: {current.label}</span>
                    <Chevron open={open} />
                </button>
                {open && (
                    <div
                        id="language-row-options"
                        role="menu"
                        aria-label={menuLabel}
                        onKeyDown={onMenuKeyDown}
                        className="pb-2 pl-1"
                    >
                        {options}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={`relative ${className}`} ref={rootRef}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                onKeyDown={onTriggerKeyDown}
                aria-label={`${menuLabel}: ${current.label}`}
                aria-haspopup="menu"
                aria-expanded={open}
                className={`group flex items-center gap-1.5 h-10 px-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150 ease-out focus-ring
                    ${open ? "bg-frost/15 text-azure-light" : "text-frost/75 hover:text-azure-light hover:bg-frost/10"}`}
            >
                <FlagIcon flag={current.flag} />
                <span className="tabular-nums">{current.code.toUpperCase()}</span>
                <Chevron open={open} />
            </button>

            {open && (
                <div
                    role="menu"
                    aria-label={menuLabel}
                    onKeyDown={onMenuKeyDown}
                    className="absolute right-0 mt-3 w-52 max-w-[90vw] glass-strong text-ink rounded-lg shadow-xl border border-line/60 p-1.5 animate-scale-in origin-top-right z-50"
                >
                    {options}
                </div>
            )}
        </div>
    );
}
