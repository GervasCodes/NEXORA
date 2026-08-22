import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { suggestRestockAndPricing } from "../../api/ai";

// Phase Q8 (AI Extensions - advisory only). seller.repository.js#getSalesVelocityByProduct
// computes the actual restock-urgency/slow-mover numbers this reads (see
// ai.service.js#suggestRestockAndPricing) - this only asks Nexora AI to
// phrase a suggestion on top of them. Silently renders nothing if the
// call fails or there's nothing to flag, same as NexoraAnalyticsSummary.
export default function NexoraDemandForecast() {
    const [forecast, setForecast] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        suggestRestockAndPricing()
            .then((result) => { if (!cancelled) setForecast(result); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return <div className="h-16 bg-line/40 rounded-lg animate-pulse mb-6" />;
    }
    if (!forecast || (forecast.restockSoon.length === 0 && forecast.slowMovers.length === 0)) return null;

    return (
        <div className="rounded-lg glass-strong p-4 mb-6">
            <div className="flex items-start gap-2 mb-3">
                <span className="h-4 w-4 mt-0.5 rounded-full bg-gradient-to-br from-azure-light to-azure-deep shrink-0" aria-hidden="true" />
                <p className="text-sm text-abyss">{forecast.explanation}</p>
            </div>

            {forecast.restockSoon.length > 0 && (
                <div className="mb-3">
                    <p className="text-xs uppercase tracking-widest text-ash mb-1.5">Restock soon</p>
                    <ul className="space-y-1">
                        {forecast.restockSoon.map((p) => (
                            <li key={p.id} className="text-sm flex justify-between">
                                <Link to={`/seller/products/${p.id}/edit`} className="hover:underline">{p.name}</Link>
                                <span className="text-ash text-xs">~{p.daysOfStockRemaining}d left ({p.stock} in stock)</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {forecast.slowMovers.length > 0 && (
                <div>
                    <p className="text-xs uppercase tracking-widest text-ash mb-1.5">Slow movers</p>
                    <ul className="space-y-1">
                        {forecast.slowMovers.map((p) => (
                            <li key={p.id} className="text-sm flex justify-between">
                                <Link to={`/seller/products/${p.id}/edit`} className="hover:underline">{p.name}</Link>
                                <span className="text-ash text-xs">{p.stock} in stock, no recent sales</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
