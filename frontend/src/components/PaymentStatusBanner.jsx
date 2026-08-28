import { useLanguage } from "../context/LanguageContext";
import { ORDER_STATE } from "../utils/orderStatusModel";

// Phase 2 (Honest Status Transparency): renders only for the two
// payment-side states (pending / failed) - the two dispatch-side states
// (searching / assigned) get their own distinct treatment directly in
// TrackingWidget, since that's specifically the delivery-tracking piece.
// Deliberately a different shape (icon + tinted panel) for each state
// rather than the same box with a swapped string, per the phase brief.
export default function PaymentStatusBanner({ state }) {
    const { t } = useLanguage();

    if (state === ORDER_STATE.PAYMENT_PENDING) {
        return (
            <div className="flex items-start gap-3 bg-mango/10 border border-mango/30 rounded-lg px-4 py-3 mb-4 animate-fade-in">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" className="w-5 h-5 shrink-0 mt-0.5 text-mango-dark">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                </svg>
                <div>
                    <p className="text-sm font-medium text-mango-dark">{t("order.status.paymentPending.title")}</p>
                    <p className="text-xs text-ash mt-0.5">{t("order.status.paymentPending.body")}</p>
                </div>
            </div>
        );
    }

    if (state === ORDER_STATE.PAYMENT_FAILED) {
        return (
            <div className="flex items-start gap-3 bg-coral/10 border border-coral/30 rounded-lg px-4 py-3 mb-4 animate-fade-in">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" className="w-5 h-5 shrink-0 mt-0.5 text-coral">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m15 9-6 6M9 9l6 6" />
                </svg>
                <div>
                    <p className="text-sm font-medium text-coral">{t("order.status.paymentFailed.title")}</p>
                    <p className="text-xs text-ash mt-0.5">{t("order.status.paymentFailed.body")}</p>
                </div>
            </div>
        );
    }

    return null;
}

// Small reassurance pill shown alongside the "searching for a rider"
// tracking widget - the phase brief's core requirement is that payment
// confirmation stays visibly separate from (and unaffected by) dispatch
// still being in progress, so this never lives inside the same box as
// the searching copy.
export function PaymentConfirmedPill() {
    const { t } = useLanguage();

    return (
        <div className="flex items-center gap-1.5 text-xs font-medium text-teal mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" className="w-3.5 h-3.5 shrink-0">
                <path d="M20 6 9 17l-5-5" />
            </svg>
            {t("order.status.paymentConfirmed")}
        </div>
    );
}
