import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { COUNTRY_CODES, DEFAULT_COUNTRY_DIAL } from "../data/countryCodes";

// Shared phone input - country selector + national number field,
// producing the same fully-assembled "+<dial><digits>" string
// Register.jsx already builds and sends. Centralizing it here (Section 3
// of the Monetization Control roadmap - Mobile Number Country Code
// System) means every other phone field (profile, seller settings,
// checkout, mobile-money payment forms) gets the same country picker
// and assembly logic Register.jsx pioneered, instead of each screen
// re-implementing its own.
//
// Props:
//   value    - the full E.164-ish string ("+255712345678") to pre-fill,
//              e.g. from a loaded profile. Optional.
//   onChange - called with the assembled "+<dial><digits>" string
//              every time the country or number field changes.
//   id       - passed to the number <input> so a caller's own visible
//              <label htmlFor={id}> associates correctly (jsx-a11y's
//              label-has-associated-control rule - added in Phase 3 -
//              flags a sibling <label> with no for/wrapping relationship,
//              which every caller had before this prop existed). When
//              set, the built-in aria-label is omitted so the connected
//              <label>'s own text becomes the accessible name instead -
//              an aria-label would otherwise silently override it.
//   ariaLabel - overrides the default "Phone" aria-label on the number
//              field, for callers that want more specific wording
//              ("Contact phone", "Delivery phone", etc.) without also
//              rendering a visible label.
//   required, placeholder, className - passed through to the number
//              <input>.
export default function PhoneInput({ value, onChange, required = false, disabled = false, placeholder = "712 345 678", className = "", id, ariaLabel }) {
    const { t } = useLanguage();
    const [dial, setDial] = useState(() => splitIncoming(value).dial);
    const [national, setNational] = useState(() => splitIncoming(value).national);

    // Tracks the last value THIS component emitted, so the effect below
    // can tell "value changed because the parent echoed back what we
    // just sent" apart from "value changed for some other reason (form
    // reset, a profile finished loading, programmatic clear)". Without
    // this distinction, every keystroke's round trip through the
    // parent's state would re-run splitIncoming() and reset local state
    // mid-typing - previously this was avoided only by never
    // resyncing from `value` after mount at all, which fixed the
    // mid-typing problem but broke external resets (clearing the form
    // wouldn't clear this field). Comparing against the last thing we
    // emitted fixes both at once.
    const lastEmitted = useRef(value);

    useEffect(() => {
        if (value !== lastEmitted.current) {
            const next = splitIncoming(value);
            setDial(next.dial);
            setNational(next.national);
            lastEmitted.current = value;
        }
    }, [value]);

    // nextRawNational is exactly what the number field currently
    // displays (leading trunk "0" and all, if the person typed one out
    // of habit despite the placeholder showing the number without it) -
    // stripped here, at emit time, rather than from the displayed value,
    // so a freshly-typed "0" doesn't visibly vanish out from under the
    // person's cursor before they've typed the rest of the number.
    const emit = (nextDial, nextRawNational) => {
        const digits = nextRawNational.replace(/\D/g, "").replace(/^0+/, "");
        const next = digits ? `${nextDial}${digits}` : "";
        lastEmitted.current = next;
        onChange(next);
    };

    return (
        <div className="flex gap-2">
            <select
                value={dial}
                disabled={disabled}
                aria-label={t("auth.countryCodeLabel")}
                onChange={(e) => {
                    setDial(e.target.value);
                    emit(e.target.value, national);
                }}
                className="border border-line rounded-md px-2 py-2 text-sm w-28 shrink-0 focus-ring disabled:opacity-60"
            >
                {COUNTRY_CODES.map((c) => (
                    <option key={`${c.iso2}-${c.dial}`} value={c.dial}>{c.dial} {c.iso2}</option>
                ))}
            </select>
            <input
                type="tel"
                inputMode="numeric"
                id={id}
                required={required}
                disabled={disabled}
                placeholder={placeholder}
                aria-label={id ? undefined : (ariaLabel || t("auth.phoneLabel"))}
                value={national}
                onChange={(e) => {
                    setNational(e.target.value);
                    emit(dial, e.target.value);
                }}
                className={`flex-1 border border-line rounded-md px-3 py-2 text-sm focus-ring disabled:opacity-60 ${className}`}
            />
        </div>
    );
}

// Splits an incoming full phone string (however it was stored - E.164
// from the backend, or a raw local number from older data) into a
// {dial, national} pair to pre-fill the two controls. Falls back to
// the longest matching known dial code so e.g. "+255712345678" resolves
// to "+255" not a shorter accidental prefix match.
function splitIncoming(fullValue) {
    const trimmed = String(fullValue || "").trim();
    if (!trimmed) return { dial: DEFAULT_COUNTRY_DIAL, national: "" };

    const match = [...COUNTRY_CODES]
        .sort((a, b) => b.dial.length - a.dial.length)
        .find((c) => trimmed.startsWith(c.dial));

    if (match) {
        return { dial: match.dial, national: trimmed.slice(match.dial.length).replace(/\D/g, "") };
    }

    return { dial: DEFAULT_COUNTRY_DIAL, national: trimmed.replace(/\D/g, "") };
}
