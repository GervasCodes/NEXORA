import { useEffect, useState } from "react";
import api from "../../api/client";
import { formatDate } from "../../utils/format";
import PageLoader from "../../components/PageLoader";

export default function DeliveryRatings() {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        api.get("/delivery/my/rating-summary")
            .then(({ data }) => setSummary(data.data))
            .catch(() => setError("Couldn't load your ratings."))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <PageLoader />;
    if (error) return <p role="alert" className="text-coral text-sm">{error}</p>;
    if (!summary) return null;

    const { average_rating, rating_count, ratings } = summary;

    return (
        <div className="animate-fade-in">
            <h1 className="font-display text-2xl mb-1">Ratings</h1>
            <p className="text-ash text-sm mb-8">What buyers have said about your deliveries.</p>

            <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="border border-teal/30 bg-teal/5 rounded-lg p-4 animate-slide-up hover:-translate-y-0.5 hover:shadow-md transition-all">
                    <p className="text-xs text-ash mb-1">Average rating</p>
                    <p className="text-xl font-medium text-teal">
                        {average_rating ? `${average_rating} ★` : "No ratings yet"}
                    </p>
                </div>
                <div className="border border-line rounded-lg p-4 animate-slide-up hover:-translate-y-0.5 hover:shadow-md transition-all" style={{ animationDelay: "40ms" }}>
                    <p className="text-xs text-ash mb-1">Total ratings</p>
                    <p className="text-xl font-medium">{rating_count}</p>
                </div>
            </div>

            <div>
                <p className="text-sm font-medium mb-3">Recent ratings</p>
                {ratings.length === 0 ? (
                    <p className="text-ash text-sm">No ratings yet - they'll show up here after buyers rate a delivered order.</p>
                ) : (
                    <ul className="space-y-2">
                        {ratings.map((r, i) => (
                            <li
                                key={r.id}
                                className="border border-line rounded-lg p-3 text-sm animate-slide-up hover:shadow-md hover:-translate-y-0.5 transition-all"
                                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium">{r.order_number}</span>
                                    <span className="text-mango leading-none">
                                        {"★".repeat(r.rating)}
                                        <span className="text-line">{"★".repeat(5 - r.rating)}</span>
                                    </span>
                                </div>
                                {r.comment && <p className="text-ash">{r.comment}</p>}
                                <p className="text-xs text-ash mt-1">{formatDate(r.created_at)}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
