import { useEffect, useRef, useState } from "react";
import { extractErrorMessage } from "../../../api/client";
import { lookupStockItems } from "../../../api/stock";
import Input from "../../../components/ui/Input";
import { useLanguage } from "../../../context/LanguageContext";
import { formatMoney } from "../../../utils/format";
import { cacheItems, searchCachedItems } from "../../../utils/stockOfflineStore";
import { SourceBadge } from "./StockItems";

// Big search / barcode box with a result list. A barcode scanner "types" the code
// and presses Enter: Enter adds the top result when it is an exact barcode/SKU hit,
// or the only result.
export default function ItemPicker({ onPick, priceKind = "sell", focusOnMount = false }) {
    const { t } = useLanguage();
    const [q, setQ] = useState("");
    const [results, setResults] = useState(null);
    const [error, setError] = useState("");
    const [fromCache, setFromCache] = useState(false);
    const seq = useRef(0);
    const inputRef = useRef(null);

    useEffect(() => {
        if (focusOnMount) inputRef.current?.focus();
    }, [focusOnMount]);

    useEffect(() => {
        const mine = ++seq.current;
        const id = setTimeout(() => {
            lookupStockItems({ q: q.trim() || undefined, limit: 20 })
                .then((rows) => { cacheItems(rows); if (mine === seq.current) { setResults(rows); setError(""); setFromCache(false); } })
                .catch(async (err) => {
                    if (mine !== seq.current) return;
                    // No connection: search the items remembered on this device instead.
                    if (!err.response) {
                        const cached = await searchCachedItems(q, 20);
                        if (mine === seq.current) { setResults(cached); setError(""); setFromCache(true); }
                        return;
                    }
                    setError(extractErrorMessage(err));
                });
        }, q ? 250 : 0);
        return () => clearTimeout(id);
    }, [q]);

    const pick = (item) => {
        onPick(item);
        setQ("");
        inputRef.current?.focus();
    };

    const onKeyDown = (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const code = q.trim();
        if (!code || !results || results.length === 0) return;
        const exact = results.find((r) => r.barcode === code || r.sku === code);
        if (exact) pick(exact);
        else if (results.length === 1) pick(results[0]);
    };

    return (
        <div>
            <label className="text-xs text-ash flex flex-col gap-1">
                {t("stock.trade.searchItem")}
                <Input ref={inputRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
                    className="min-h-[48px] text-base" autoComplete="off" enterKeyHint="search" />
            </label>
            <div aria-live="polite" className="sr-only">{results ? t("stock.trade.resultsCount", { count: results.length }) : ""}</div>
            {error && <p className="text-coral text-xs mt-2" role="alert">{error}</p>}
            {fromCache && <p className="text-xs text-mango-dark mt-2" role="status">{t("stock.p8.off.cachedItems")}</p>}
            {results && results.length === 0 && <p className="text-sm text-ash mt-3">{t("stock.trade.noResults")}</p>}
            {results && results.length > 0 && (
                <ul className="mt-2 border border-line rounded-lg divide-y divide-line max-h-72 overflow-auto">
                    {results.map((r) => (
                        <li key={r.id}>
                            <button type="button" onClick={() => pick(r)}
                                className="w-full text-left px-3 py-2 min-h-[48px] flex items-center justify-between gap-3 hover:bg-line/20 focus-ring">
                                <span className="min-w-0">
                                    <span className="block text-sm truncate">
                                        {r.name}{r.variant_label ? <span className="text-ash"> ({r.variant_label})</span> : null}
                                    </span>
                                    <span className="block text-xs text-ash">
                                        {t("stock.inStock", { count: r.stock })}
                                        {" · "}
                                        {priceKind === "cost"
                                            ? (r.cost_price !== null ? formatMoney(r.cost_price) : "-")
                                            : formatMoney(r.sell_price)}
                                    </span>
                                </span>
                                <SourceBadge source={r.source} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
