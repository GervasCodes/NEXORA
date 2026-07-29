import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useLanguage } from "../context/LanguageContext";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// Plain calendar-date helpers, deliberately not using a timezone-aware
// library - a service's availability is keyed by a calendar date
// ("2026-08-01"), never an instant, matching the convention
// availability.service.js's own dateRange() helper uses server-side.
const toDateKey = (year, month, day) => {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
};

const startOfMonthKey = (year, month) => toDateKey(year, month, 1);
const endOfMonthKey = (year, month) => {
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return toDateKey(year, month, lastDay);
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const MONTH_LABEL = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

/**
 * Renders one month at a time of a service's availability
 * (GET /services/:id/availability), highlighting a caller-supplied set of
 * selected dates and reporting selections back to the caller.
 *
 * Presentational + data-fetching only - it doesn't know about bookings or
 * providers. ServiceDetail.jsx uses it in `clickable` mode to let a buyer
 * pick dates; SellerAvailability.jsx uses it read-only, just to show the
 * result of a PUT it already made.
 *
 * Two selection gestures are supported when `clickable`:
 *  - a tap/click on a single day fires `onDateClick(dateKey, info)`, same
 *    as before - ServiceDetail's own two-click state machine still drives
 *    per_night check-in/check-out selection this way.
 *  - a press-and-drag across multiple days fires `onRangeSelect(start, end)`
 *    once on release, letting a buyer sweep out a check-in/check-out range
 *    in one gesture instead of two separate taps. A drag is only allowed to
 *    extend across days that are all available (and not in the past) - it
 *    stops at the first unavailable/past day it meets, since that's the
 *    same guarantee the two-click flow already had (each individual click
 *    target has to be `available` to register).
 */
export default function AvailabilityCalendar({
    serviceId,
    clickable = false,
    selectedDates = [],
    onDateClick,
    onRangeSelect,
    refreshToken
}) {
    const { format } = useCurrency();
    const { t } = useLanguage();
    const now = new Date();
    const [viewYear, setViewYear] = useState(now.getFullYear());
    const [viewMonth, setViewMonth] = useState(now.getMonth());
    const [days, setDays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Drag-select state. dragAnchorDay/dragHoverDay are day-of-month ints
    // (not date keys) since a drag never crosses a month boundary - only
    // one month's cells are ever mounted at a time.
    const [dragAnchorDay, setDragAnchorDay] = useState(null);
    const [dragHoverDay, setDragHoverDay] = useState(null);
    const isDraggingRef = useRef(false);

    useEffect(() => {
        if (!serviceId) return;

        setLoading(true);
        setError("");

        const start_date = startOfMonthKey(viewYear, viewMonth);
        const end_date = endOfMonthKey(viewYear, viewMonth);

        api.get(`/services/${serviceId}/availability`, { params: { start_date, end_date } })
            .then(({ data }) => setDays(data.data))
            .catch(() => setError("Couldn't load availability for this month."))
            .finally(() => setLoading(false));
    }, [serviceId, viewYear, viewMonth, refreshToken]);

    const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

    const selectedSet = useMemo(() => new Set(selectedDates), [selectedDates]);

    const leadingBlanks = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
    const min = todayKey();

    const cells = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(day);

    const dayIsAvailable = (day) => {
        const dateKey = toDateKey(viewYear, viewMonth, day);
        const info = byDate.get(dateKey);
        return !!info?.available && dateKey >= min;
    };

    const endDrag = () => {
        if (!isDraggingRef.current || dragAnchorDay === null) {
            isDraggingRef.current = false;
            setDragAnchorDay(null);
            setDragHoverDay(null);
            return;
        }

        const anchor = dragAnchorDay;
        const hover = dragHoverDay ?? dragAnchorDay;
        const lo = Math.min(anchor, hover);
        const hi = Math.max(anchor, hover);

        if (lo === hi) {
            // A plain tap, not a drag - preserve the existing single-click
            // contract so callers that only implement onDateClick keep working.
            const dateKey = toDateKey(viewYear, viewMonth, lo);
            onDateClick?.(dateKey, byDate.get(dateKey));
        } else if (typeof onRangeSelect === "function") {
            const rangeInfo = {};
            for (let d = lo; d <= hi; d++) {
                const dateKey = toDateKey(viewYear, viewMonth, d);
                rangeInfo[dateKey] = byDate.get(dateKey);
            }
            onRangeSelect(toDateKey(viewYear, viewMonth, lo), toDateKey(viewYear, viewMonth, hi), rangeInfo);
        } else {
            // Caller only wired up onDateClick - fall back to firing it
            // twice (start, then end) so range selection still degrades
            // gracefully instead of silently doing nothing.
            onDateClick?.(toDateKey(viewYear, viewMonth, lo), byDate.get(toDateKey(viewYear, viewMonth, lo)));
            onDateClick?.(toDateKey(viewYear, viewMonth, hi), byDate.get(toDateKey(viewYear, viewMonth, hi)));
        }

        isDraggingRef.current = false;
        setDragAnchorDay(null);
        setDragHoverDay(null);
    };

    useEffect(() => {
        if (!clickable) return undefined;
        window.addEventListener("pointerup", endDrag);
        window.addEventListener("pointercancel", endDrag);
        return () => {
            window.removeEventListener("pointerup", endDrag);
            window.removeEventListener("pointercancel", endDrag);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clickable, dragAnchorDay, dragHoverDay, byDate, viewYear, viewMonth, onDateClick, onRangeSelect]);

    const handlePointerDown = (e, day) => {
        if (!clickable || !dayIsAvailable(day)) return;
        // Touch pointers get implicit capture to the element they started
        // on by default, which would stop pointerenter firing on the other
        // day cells as a finger drags across them. Releasing it lets the
        // drag-select gesture work on mobile the same way it does with a
        // mouse.
        e.target.releasePointerCapture?.(e.pointerId);
        isDraggingRef.current = true;
        setDragAnchorDay(day);
        setDragHoverDay(day);
    };

    const handlePointerEnter = (day) => {
        if (!isDraggingRef.current || dragAnchorDay === null) return;
        const lo = Math.min(dragAnchorDay, day);
        const hi = Math.max(dragAnchorDay, day);
        for (let d = lo; d <= hi; d++) {
            if (!dayIsAvailable(d)) return; // don't extend the drag through a blocked/past day
        }
        setDragHoverDay(day);
    };

    const goToPrevMonth = () => {
        if (viewMonth === 0) {
            setViewMonth(11);
            setViewYear((y) => y - 1);
        } else {
            setViewMonth((m) => m - 1);
        }
    };

    const goToNextMonth = () => {
        if (viewMonth === 11) {
            setViewMonth(0);
            setViewYear((y) => y + 1);
        } else {
            setViewMonth((m) => m + 1);
        }
    };

    const isDragging = dragAnchorDay !== null && dragHoverDay !== null;
    const dragLo = isDragging ? Math.min(dragAnchorDay, dragHoverDay) : null;
    const dragHi = isDragging ? Math.max(dragAnchorDay, dragHoverDay) : null;

    return (
        <div className="border border-line rounded-lg p-4 select-none">
            <div className="flex items-center justify-between mb-3">
                <button
                    type="button"
                    onClick={goToPrevMonth}
                    aria-label={t("calendar.previousMonth")}
                    className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-line/50 transition-colors"
                >
                    ‹
                </button>
                <p className="text-sm font-medium">{MONTH_LABEL.format(new Date(Date.UTC(viewYear, viewMonth, 1)))}</p>
                <button
                    type="button"
                    onClick={goToNextMonth}
                    aria-label={t("calendar.nextMonth")}
                    className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-line/50 transition-colors"
                >
                    ›
                </button>
            </div>

            {error && <p role="alert" className="text-coral text-xs mb-2">{error}</p>}

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-ash mb-1">
                {WEEKDAY_LABELS.map((label) => (
                    <span key={label}>{label}</span>
                ))}
            </div>

            {loading ? (
                <div className="h-40 flex items-center justify-center text-ash text-xs">{t("calendar.loading")}</div>
            ) : (
                <div className="grid grid-cols-7 gap-1">
                    {cells.map((day, i) => {
                        if (day === null) return <span key={`blank-${i}`} />;

                        const dateKey = toDateKey(viewYear, viewMonth, day);
                        const info = byDate.get(dateKey);
                        const isPast = dateKey < min;
                        const isAvailable = !!info?.available && !isPast;
                        const isSelected = selectedSet.has(dateKey);
                        const isInDrag = isDragging && day >= dragLo && day <= dragHi;
                        const canClick = clickable && isAvailable && (typeof onDateClick === "function" || typeof onRangeSelect === "function");

                        return (
                            <button
                                key={dateKey}
                                type="button"
                                disabled={!canClick}
                                onPointerDown={(e) => handlePointerDown(e, day)}
                                onPointerEnter={() => handlePointerEnter(day)}
                                title={
                                    isPast
                                        ? t("calendar.pastDate")
                                        : isAvailable
                                            ? format(info.price)
                                            : t("calendar.notAvailable")
                                }
                                className={`aspect-square rounded-md text-xs flex flex-col items-center justify-center gap-0.5 transition-colors touch-none ${
                                    isSelected || isInDrag
                                        ? "bg-ink text-paper"
                                        : isAvailable
                                            ? canClick
                                                ? "bg-teal/10 text-ink hover:bg-teal/20 cursor-pointer"
                                                : "bg-teal/10 text-ink"
                                            : "text-ash/50 line-through"
                                }`}
                            >
                                <span>{day}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="flex items-center gap-4 mt-3 text-xs text-ash flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-teal/10 inline-block" /> {t("calendar.open")}</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-ink inline-block" /> {t("calendar.selected")}</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border border-line inline-block" /> {t("calendar.unavailable")}</span>
            </div>

            {clickable && typeof onRangeSelect === "function" && (
                <p className="text-[11px] text-ash/70 mt-2">{t("calendar.dragHint")}</p>
            )}
        </div>
    );
}
