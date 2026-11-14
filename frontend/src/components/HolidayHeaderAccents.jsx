import { lazy, Suspense } from "react";
import { useHoliday } from "../context/HolidayContext";

// Phase 4: thin wrappers the Header renders. Each one does nothing and loads
// nothing unless the holiday theme is visible; the drawing code lives in one
// lazy chunk (holiday/HeaderAccents.jsx).
const Lights = lazy(() => import("./holiday/HeaderAccents").then((m) => ({ default: m.HeaderLights })));
const Logo = lazy(() => import("./holiday/HeaderAccents").then((m) => ({ default: m.LogoAccent })));

// Lights (Christmas) or gold sparkles (New Year) along the header's lower edge,
// plus a short greeting. Must be rendered inside the sticky <header>.
export function HolidayHeaderLights() {
    const { visible, mode } = useHoliday();
    if (!visible) return null;
    return (
        <Suspense fallback={null}>
            <Lights mode={mode} />
        </Suspense>
    );
}

// Santa hat (Christmas) or a gold sparkle (New Year) on the logo mark. Must be
// rendered inside a `relative` wrapper around the logo image.
export function HolidayLogoAccent() {
    const { visible, mode } = useHoliday();
    if (!visible) return null;
    return (
        <Suspense fallback={null}>
            <Logo mode={mode} />
        </Suspense>
    );
}
