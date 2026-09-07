import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { suggestRestockAndPricing } from "../../api/ai";
import AssistantSparkleIcon from "./AssistantSparkleIcon";

// AI Extensions - advisory only. seller.repository.js#getSalesVelocityByProduct
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
            <div className="flex items-start gap-3 mb-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-azure-light to-azure-deep flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <AssistantSparkleIcon className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-azure mb-1">
                        Nexora Assistant · Demand forecast
                    </p>
                    <p className="text-sm text-abyss">{forecast.explanation}</p>
                </div>
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
