import { useEffect, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { useHoliday } from "../../context/HolidayContext";

// Phase 4: the small decorations that live in the header. Lazy chunk, only
// requested when the holiday theme is visible (see HolidayHeaderAccents.jsx).
// Everything here is pointer-events: none and positioned absolutely, so none
// of it takes space or moves the header.

const GREETING_MS = 8000;
const BULB_COUNT = 22;
const BULB_COLORS = ["--color-coral", "--color-mango", "--color-teal", "--color-azure-light"];
const GOLD = "#E9B824";

// Keyframes live here, not in index.css, so they ship in this lazy chunk.
const STYLES = `
@keyframes nx-holi-twinkle { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
@keyframes nx-holi-glint { 0%, 100% { opacity: .5; transform: scale(.8); } 50% { opacity: 1; transform: scale(1.1); } }
@keyframes nx-holi-greet {
    0% { opacity: 0; transform: translateY(-4px); }
    10%, 85% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-2px); }
}
.nx-holi-bulb { animation: nx-holi-twinkle 2.4s ease-in-out infinite; }
.nx-holi-glint { animation: nx-holi-glint 2.8s ease-in-out infinite; }
.nx-holi-greet { animation: nx-holi-greet ${GREETING_MS}ms ease-out forwards; }
@media (prefers-reduced-motion: reduce) {
    .nx-holi-bulb, .nx-holi-glint, .nx-holi-greet { animation: none; }
}
`;

function Bulb({ index }) {
    const color = `rgb(var(${BULB_COLORS[index % BULB_COLORS.length]}))`;
    const hang = index % 2 === 0 ? 3 : 7;
    return (
        <span className="flex flex-col items-center">
            <span className="w-px bg-frost/30" style={{ height: hang }} />
            <span
                className="nx-holi-bulb block"
                style={{
                    width: 5,
                    height: 8,
                    borderRadius: 2,
                    background: color,
                    boxShadow: `0 0 6px 1px ${color}`,
                    animationDelay: `${(index * 0.23).toFixed(2)}s`
                }}
            />
        </span>
    );
}

function Glint({ index }) {
    const size = index % 3 === 0 ? 10 : 7;
    return (
        <span
            className="nx-holi-glint block"
            style={{ marginTop: index % 2 === 0 ? 2 : 7, animationDelay: `${(index * 0.31).toFixed(2)}s` }}
        >
            <svg width={size} height={size} viewBox="0 0 24 24" fill={GOLD} aria-hidden="true">
                <path d="M12 0 14.6 9.4 24 12 14.6 14.6 12 24 9.4 14.6 0 12 9.4 9.4Z" />
            </svg>
        </span>
    );
}

// Shows once per page load, then removes itself. Decorative, so hidden from
// screen readers; it is not information anyone needs.
function Greeting({ mode, year }) {
    const { t } = useLanguage();
    const [show, setShow] = useState(true);

    useEffect(() => {
        const id = setTimeout(() => setShow(false), GREETING_MS + 200);
        return () => clearTimeout(id);
    }, []);

    if (!show) return null;
    const text = mode === "newyear" ? t("holiday.greeting.newyear", { year }) : t("holiday.greeting.christmas");
    return (
        <div className="absolute inset-x-0 top-full mt-5 flex justify-center px-4" aria-hidden="true">
            <span
                className="nx-holi-greet glass-dark block max-w-full truncate whitespace-nowrap rounded-lg px-3 py-1.5 font-display italic text-sm shadow-lg"
                style={{ color: mode === "newyear" ? "#F4C430" : undefined }}
            >
                {text}
            </span>
        </div>
    );
}

export function HeaderLights({ mode }) {
    const { year } = useHoliday();
    return (
        <>
            <style>{STYLES}</style>
            <div className="pointer-events-none absolute inset-x-0 top-full" aria-hidden="true" data-holiday-lights={mode}>
                <div className="h-px bg-frost/20" />
                <div className="flex justify-between px-3 sm:px-5">
                    {Array.from({ length: BULB_COUNT }, (_, i) => (mode === "newyear" ? <Glint key={i} index={i} /> : <Bulb key={i} index={i} />))}
                </div>
            </div>
            <Greeting mode={mode} year={year} />
        </>
    );
}

// Santa hat or gold glint on the logo mark. The parent wrapper is `relative`.
export function LogoAccent({ mode }) {
    if (mode === "newyear") {
        return (
            <>
                <style>{STYLES}</style>
                <span className="nx-holi-glint pointer-events-none absolute -top-1.5 -right-2 block" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={GOLD}>
                        <path d="M12 0 14.6 9.4 24 12 14.6 14.6 12 24 9.4 14.6 0 12 9.4 9.4Z" />
                    </svg>
                </span>
            </>
        );
    }
    return (
        <svg
            className="pointer-events-none absolute -top-2.5 -left-2 block"
            style={{ transform: "rotate(-14deg)" }}
            width="20"
            height="17"
            viewBox="0 0 24 20"
            aria-hidden="true"
            data-holiday-hat
        >
            <path d="M3.5 14C5 6 11 2 17 5.5c2.6 1.5 4 4.6 4 8.5Z" fill="#C8312B" />
            <rect x="1.5" y="13" width="21" height="5" rx="2.5" fill="#FFFFFF" />
            <circle cx="20.5" cy="6.5" r="2.6" fill="#FFFFFF" />
        </svg>
    );
}
