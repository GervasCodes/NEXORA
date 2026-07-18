import { useState } from "react";
import api, { extractErrorMessage } from "../api/client";

const STARS = [1, 2, 3, 4, 5];

// Shown on OrderDetail once a delivery is "delivered" - either the
// buyer's existing rating (read-only), or a form to leave one. Ratings
// are one-per-order (migration 032 / delivery.service.rateDelivery), so
// once `existingRating` is set this never shows the form again.
export default function DeliveryAgentRating({ orderId, existingRating, onRated }) {
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    if (existingRating) {
        return (
            <div className="border border-line rounded-md px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-ash mb-1">Your rating</p>
                <p className="text-mango text-lg leading-none">
                    {"★".repeat(existingRating.rating)}
                    <span className="text-line">{"★".repeat(5 - existingRating.rating)}</span>
                </p>
                {existingRating.comment && (
                    <p className="text-sm text-ash mt-2">{existingRating.comment}</p>
                )}
            </div>
        );
    }

    const submit = async (e) => {
        e.preventDefault();

        if (!rating) {
            setError("Please select a star rating.");
            return;
        }

        setSubmitting(true);
        setError("");
        try {
            await api.post(`/delivery/${orderId}/rating`, { rating, comment: comment.trim() || undefined });
            onRated();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} className="border border-line rounded-md px-4 py-4">
            <p className="text-sm font-medium mb-3">Rate your delivery agent</p>

            <div className="flex gap-1 mb-3">
                {STARS.map((n) => (
                    <button
                        type="button"
                        key={n}
                        onClick={() => setRating(n)}
                        onMouseEnter={() => setHoverRating(n)}
                        onMouseLeave={() => setHoverRating(0)}
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                        className={`text-2xl leading-none transition-colors focus-ring rounded ${
                            n <= (hoverRating || rating) ? "text-mango" : "text-line"
                        }`}
                    >
                        ★
                    </button>
                ))}
            </div>

            <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional comment about the delivery"
                rows={2}
                maxLength={500}
                className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring mb-3 bg-paper"
            />

            {error && <p className="text-coral text-sm mb-3">{error}</p>}

            <button
                type="submit"
                disabled={submitting}
                className="bg-mango text-abyss px-4 py-2 rounded-md text-sm font-medium hover:bg-mango-dark transition-colors focus-ring disabled:opacity-60"
            >
                {submitting ? "Submitting…" : "Submit rating"}
            </button>
        </form>
    );
}
