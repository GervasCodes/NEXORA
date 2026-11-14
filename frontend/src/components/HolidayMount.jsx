import { lazy, Suspense } from "react";
import { useHoliday } from "../context/HolidayContext";

// Phase 4: mounts the full-page holiday animation. When the theme is off
// (server says no, visitor dismissed it, reduced motion, data saver) this
// renders nothing and the animation code is never downloaded.
const HolidayLayer = lazy(() => import("./holiday/HolidayLayer"));

export default function HolidayMount() {
    const { visible, mode } = useHoliday();
    if (!visible) return null;
    return (
        <Suspense fallback={null}>
            <HolidayLayer mode={mode} />
        </Suspense>
    );
}
