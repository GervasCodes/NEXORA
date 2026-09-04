import { useEffect, useMemo, useRef, useState } from "react";
import api, { extractErrorMessage } from "../api/client";
import AvailabilityCalendar from "./AvailabilityCalendar";
import Button from "./ui/Button";

// Same inclusive-date-range helper ServiceDetail.jsx's booking widget
// uses, duplicated here rather than imported since it's a few lines and
// ServiceDetail.jsx doesn't export it.
const inclusiveDateRange = (start, end) => {
    const dates = [];
    const cursor = new Date(`${start}T00:00:00Z`);
    const last = new Date(`${end}T00:00:00Z`);
    while (cursor <= last) {
        dates.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
};

/**
 * RescheduleModal - Phase 7 (UI/UX remediation).
 *
 * Lets a buyer pick a new date (or check-in/check-out range, for a
 * per_night service) for an existing booking, reusing
 * AvailabilityCalendar exactly the way ServiceDetail.jsx's own booking
 * widget already does - same two-click / drag-select date-selection
 * logic, just posting to PUT /bookings/:id/reschedule instead of
 * POST /bookings.
 */
export default function RescheduleModal({ booking, onClose, onRescheduled }) {
    const isPerNight = booking.pricing_model === "per_night";

    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [priceByDate, setPriceByDate] = useState({});
    const [refreshToken, setRefreshToken] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const dialogRef = useRef(null);
    const lastFocusedRef = useRef(null);

    useEffect(() => {
        lastFocusedRef.current = document.activeElement;
        dialogRef.current?.focus();
        const handleKeyDown = (e) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            lastFocusedRef.current?.focus?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectedDates = useMemo(() => {
        if (!startDate) return [];
        if (!endDate || startDate === endDate) return [startDate];
        return inclusiveDateRange(startDate, endDate);
    }, [startDate, endDate]);

    const handleDateClick = (dateKey, info) => {
        setError("");
        setPriceByDate((prev) => ({ ...prev, [dateKey]: info.price }));

        if (isPerNight) {
            if (!startDate || (startDate && endDate) || dateKey <= startDate) {
                setStartDate(dateKey);
                setEndDate(null);
            } else {
                setEndDate(dateKey);
            }
        } else {
            setStartDate(dateKey);
            setEndDate(dateKey);
        }
    };

    const handleRangeSelect = (rangeStart, rangeEnd, rangeInfo) => {
        setError("");
        setPriceByDate((prev) => ({ ...prev, ...rangeInfo }));
        setStartDate(rangeStart);
        setEndDate(rangeEnd);
    };

    const canSubmit = isPerNight ? startDate && endDate && startDate !== endDate : !!startDate;

    const handleSubmit = async () => {
        setSubmitting(true);
        setError("");
        try {
            await api.put(`/bookings/${booking.id}/reschedule`, {
                start_date: startDate,
                end_date: endDate || startDate
            });
            onRescheduled();
        } catch (err) {
            setError(extractErrorMessage(err));
            setRefreshToken((t) => t + 1);
            setStartDate(null);
            setEndDate(null);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[1200] bg-abyss/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="reschedule-dialog-title"
                className="glass-strong rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <p id="reschedule-dialog-title" className="font-display text-xl mb-1">Reschedule booking</p>
                <p className="text-sm text-ink/80 mb-4">
                    {isPerNight ? "Pick new check-in and check-out dates." : "Pick a new date."}
                </p>

                <AvailabilityCalendar
                    serviceId={booking.service_id}
                    clickable
                    selectedDates={selectedDates}
                    onDateClick={handleDateClick}
                    onRangeSelect={isPerNight ? handleRangeSelect : undefined}
                    refreshToken={refreshToken}
                />

                {isPerNight && startDate && !endDate && (
                    <p className="text-xs text-ash mt-2">Check-in: {startDate} - now pick a check-out date.</p>
                )}

                {error && <p role="alert" className="text-coral text-sm mt-3">{error}</p>}

                <div className="flex gap-3 mt-5">
                    <Button onClick={onClose} variant="secondary" className="flex-1 hover:border-ash">
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="flex-1">
                        {submitting ? "Saving…" : "Confirm new date"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
