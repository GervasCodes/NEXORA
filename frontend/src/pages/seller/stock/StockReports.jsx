import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { extractErrorMessage } from "../../../api/client";
import { getReport } from "../../../api/stock";
import BarChart from "../../../components/BarChart";
import Skeleton from "../../../components/Skeleton";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorState from "../../../components/ui/ErrorState";
import Input from "../../../components/ui/Input";
import { useLanguage } from "../../../context/LanguageContext";
import { daysAgoDar, todayDar } from "../../../utils/darDate";
import { formatMoney } from "../../../utils/format";
import useStockBase from "./useStockBase";

const TABS = ["overview", "best", "low", "valuation", "close", "debts"];

// Hook: load one report and keep loading / error state. `deps` re-run it.
function useReport(name, params, enabled = true) {
    const [state, setState] = useState({ data: null, error: "" });
    const key = JSON.stringify(params || {});
    const load = useCallback(() => {
        if (!enabled) return;
        setState({ data: null, error: "" });
        getReport(name, params).then((data) => setState({ data, error: "" })).catch((err) => setState({ data: null, error: extractErrorMessage(err) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, key, enabled]);
    useEffect(load, [load]);
    return { ...state, reload: load };
}

const Stat = ({ label, value, hint, tone }) => (
    <div className="border border-line rounded-lg p-3">
        <dt className="text-xs text-ash">{label}</dt>
        <dd className={`text-lg font-medium price ${tone === "bad" ? "text-coral" : ""}`}>{value}</dd>
        {hint && <p className="text-[11px] text-ash mt-0.5">{hint}</p>}
    </div>
);

function Locked({ base }) {
    const { t } = useLanguage();
    return (
        <div className="max-w-md border border-line rounded-lg p-5" role="note">
            <h3 className="font-display text-lg mb-1">{t("stock.p8.rep.lockedTitle")}</h3>
            <p className="text-sm text-ash mb-4">{t("stock.p8.rep.lockedBody")}</p>
            <Link to={base === "/business" ? "/business/plan" : "/seller/subscription"}
                className="inline-flex items-center justify-center min-h-[44px] bg-ink text-white px-4 py-2 rounded-md text-sm font-semibold focus-ring">
                {t("seller.pos.gateCta")}
            </Link>
        </div>
    );
}

function Body({ report, children }) {
    const { t } = useLanguage();
    if (report.error) return <ErrorState title={t("stock.loadError")} hint={report.error} onRetry={report.reload} />;
    if (!report.data) return <div aria-busy="true"><Skeleton className="h-20 w-full mb-2" /><Skeleton className="h-40 w-full" /></div>;
    return children(report.data);
}

function RangeBar({ range, setRange }) {
    const { t } = useLanguage();
    const presets = [
        { id: "today", label: t("stock.p8.rep.today"), from: todayDar(), to: todayDar() },
        { id: "7", label: t("stock.p8.rep.days7"), from: daysAgoDar(6), to: todayDar() },
        { id: "30", label: t("stock.p8.rep.days30"), from: daysAgoDar(29), to: todayDar() }
    ];
    return (
        <div className="flex flex-wrap items-end gap-3 mb-4">
            <label className="text-xs text-ash flex flex-col gap-1">{t("stock.p8.from")}
                <Input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} className="min-h-[44px]" /></label>
            <label className="text-xs text-ash flex flex-col gap-1">{t("stock.p8.to")}
                <Input type="date" value={range.to} min={range.from} max={todayDar()} onChange={(e) => setRange({ ...range, to: e.target.value })} className="min-h-[44px]" /></label>
            <div className="flex gap-1" role="group" aria-label={t("stock.p8.rep.quick")}>
                {presets.map((p) => (
                    <button key={p.id} type="button" onClick={() => setRange({ from: p.from, to: p.to })}
                        className="min-h-[44px] px-3 border border-line rounded-md text-sm hover:border-ink focus-ring">{p.label}</button>
                ))}
            </div>
        </div>
    );
}

function Overview({ range, base }) {
    const { t } = useLanguage();
    const report = useReport("overview", range);
    return (
        <Body report={report}>
            {(d) => (
                <div>
                    <p className="text-xs text-ash mb-3">{t("stock.p8.rep.tzNote")}</p>
                    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                        <Stat label={t("stock.p8.rep.onPlatform")} value={formatMoney(d.on_platform.net_revenue)} hint={t("stock.p8.rep.onPlatformHint", { orders: d.on_platform.orders })} />
                        <Stat label={t("stock.p8.rep.offPlatform")} value={formatMoney(d.off_platform.net_revenue)} hint={t("stock.p8.rep.offPlatformHint", { sales: d.off_platform.sales })} />
                        <Stat label={t("stock.p8.rep.combined")} value={formatMoney(d.combined.net_revenue)} />
                        <Stat label={t("stock.p8.rep.expenses")} value={formatMoney(d.expenses)} />
                    </dl>
                    {d.cost_locked ? <Locked base={base} /> : (
                        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                            <Stat label={t("stock.p8.rep.cogs")} value={formatMoney(d.profit.cost_of_goods)} />
                            <Stat label={t("stock.p8.rep.grossProfit")} value={formatMoney(d.profit.gross_profit)} />
                            <Stat label={t("stock.p8.rep.netProfit")} value={formatMoney(d.profit.net_profit)} tone={d.profit.net_profit < 0 ? "bad" : undefined} />
                            {d.profit.cost_missing_units > 0 && <Stat label={t("stock.p8.rep.noCost")} value={d.profit.cost_missing_units} hint={t("stock.p8.rep.noCostHint")} />}
                        </dl>
                    )}
                    <p className="text-xs text-ash mb-2">{t("stock.p8.rep.onNote")}</p>
                    <BarChart data={d.daily.map((x) => ({ ...x, total: x.on_platform + x.off_platform }))} labelKey="day" valueKey="total" formatValue={formatMoney} />
                    <details className="mt-3">
                        <summary className="text-sm cursor-pointer min-h-[44px] flex items-center focus-ring">{t("stock.p8.rep.showTable")}</summary>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm mt-2">
                                <thead><tr className="text-left text-xs text-ash"><th className="py-1 pr-3">{t("stock.p8.rep.day")}</th><th className="pr-3">{t("stock.p8.rep.onPlatform")}</th><th>{t("stock.p8.rep.offPlatform")}</th></tr></thead>
                                <tbody>{d.daily.map((x) => (<tr key={x.day} className="border-t border-line"><td className="py-1 pr-3">{x.day}</td><td className="pr-3 price">{formatMoney(x.on_platform)}</td><td className="price">{formatMoney(x.off_platform)}</td></tr>))}</tbody>
                            </table>
                        </div>
                    </details>
                </div>
            )}
        </Body>
    );
}

function Best({ range, base, costOk }) {
    const { t } = useLanguage();
    const [by, setBy] = useState("units");
    const report = useReport("best-sellers", { ...range, by, limit: 20 });
    return (
        <div>
            <div className="flex gap-1 mb-3" role="group" aria-label={t("stock.p8.rep.rankBy")}>
                {["units", "revenue"].map((k) => (
                    <button key={k} type="button" aria-pressed={by === k} onClick={() => setBy(k)}
                        className={`min-h-[44px] px-3 border rounded-md text-sm focus-ring ${by === k ? "border-ink font-medium" : "border-line"}`}>{t(`stock.p8.rep.by.${k}`)}</button>
                ))}
            </div>
            <Body report={report}>
                {(d) => d.items.length === 0 ? <EmptyState title={t("stock.p8.rep.noSales")} hint={t("stock.p8.rep.noSalesHint")} /> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="text-left text-xs text-ash">
                                <th className="py-1 pr-3">{t("stock.p8.rep.item")}</th><th className="pr-3">{t("stock.p8.rep.units")}</th><th className="pr-3">{t("stock.p8.rep.revenue")}</th>
                                <th className="pr-3">{t("stock.p8.rep.onPlatform")}</th><th className={costOk ? "pr-3" : ""}>{t("stock.p8.rep.offPlatform")}</th>{costOk && <th>{t("stock.p8.rep.profit")}</th>}
                            </tr></thead>
                            <tbody>{d.items.map((i, n) => (
                                <tr key={`${i.item_id}-${n}`} className="border-t border-line">
                                    <td className="py-2 pr-3">{i.name}</td><td className="pr-3">{i.units}</td><td className="pr-3 price">{formatMoney(i.revenue)}</td>
                                    <td className="pr-3 text-xs">{i.on_platform_units}</td><td className={`text-xs ${costOk ? "pr-3" : ""}`}>{i.off_platform_units}</td>
                                    {costOk && <td className="price">{formatMoney(i.profit)}</td>}
                                </tr>))}</tbody>
                        </table>
                        {!costOk && <div className="mt-4"><Locked base={base} /></div>}
                    </div>
                )}
            </Body>
        </div>
    );
}

function Low() {
    const { t } = useLanguage();
    const report = useReport("low-stock", {});
    return (
        <Body report={report}>
            {(d) => d.items.length === 0 ? <EmptyState title={t("stock.p8.rep.noLow")} hint={t("stock.p8.rep.noLowHint")} /> : (
                <ul className="divide-y divide-line border border-line rounded-lg">
                    {d.items.map((i) => (
                        <li key={i.id} className="p-3 flex items-center justify-between gap-3">
                            <span className="text-sm">{i.name}</span>
                            <span className="text-xs text-ash">{t("stock.p8.rep.stockOf", { stock: i.stock, level: i.reorder_level })}{" "}
                                <span className={`font-medium ${i.status === "out" ? "text-coral" : "text-mango-dark"}`}>{i.status === "out" ? t("stock.out") : t("stock.low")}</span></span>
                        </li>))}
                </ul>
            )}
        </Body>
    );
}

function Valuation({ base, costOk }) {
    const { t } = useLanguage();
    const report = useReport("valuation", {}, costOk);
    if (!costOk) return <Locked base={base} />;
    return (
        <Body report={report}>
            {(d) => (
                <div>
                    <dl className="grid grid-cols-2 gap-3 mb-4">
                        <Stat label={t("stock.p8.rep.valueCost")} value={formatMoney(d.total_at_cost)} />
                        <Stat label={t("stock.p8.rep.valueRetail")} value={formatMoney(d.total_at_retail)} />
                    </dl>
                    {d.items_without_cost > 0 && <p className="text-xs text-ash mb-2">{t("stock.p8.rep.noCostItems", { count: d.items_without_cost })}</p>}
                    <div className="overflow-x-auto"><table className="w-full text-sm">
                        <thead><tr className="text-left text-xs text-ash"><th className="py-1 pr-3">{t("stock.p8.rep.item")}</th><th className="pr-3">{t("stock.p8.rep.qty")}</th><th className="pr-3">{t("stock.p8.rep.valueCost")}</th><th>{t("stock.p8.rep.valueRetail")}</th></tr></thead>
                        <tbody>{d.items.map((i) => (<tr key={i.id} className="border-t border-line"><td className="py-2 pr-3">{i.name}</td><td className="pr-3">{i.stock}</td><td className="pr-3 price">{formatMoney(i.value_at_cost)}</td><td className="price">{formatMoney(i.value_at_retail)}</td></tr>))}</tbody>
                    </table></div>
                </div>
            )}
        </Body>
    );
}

function Close() {
    const { t } = useLanguage();
    const [date, setDate] = useState(todayDar());
    const report = useReport("daily-close", { date });
    return (
        <div>
            <label className="text-xs text-ash flex flex-col gap-1 mb-4 w-48">{t("stock.p8.rep.closeDate")}
                <Input type="date" value={date} max={todayDar()} onChange={(e) => e.target.value && setDate(e.target.value)} className="min-h-[44px]" /></label>
            <Body report={report}>
                {(d) => (
                    <div>
                        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                            <Stat label={t("stock.p8.rep.salesCount")} value={d.sales.count} hint={d.sales.voided_count ? t("stock.p8.rep.voidedToday", { count: d.sales.voided_count }) : undefined} />
                            <Stat label={t("stock.p8.rep.netSales")} value={formatMoney(d.sales.net_total)} />
                            <Stat label={t("stock.p8.rep.moneyIn")} value={formatMoney(d.money.in)} hint={t("stock.p8.rep.debtsIn", { amount: formatMoney(d.money.debts_collected) })} />
                            <Stat label={t("stock.p8.rep.moneyOut")} value={formatMoney(d.money.out)} hint={t("stock.p8.rep.moneyOutHint", { refunds: formatMoney(d.money.refunds), suppliers: formatMoney(d.money.supplier_payments) })} />
                            <Stat label={t("stock.p8.rep.expenses")} value={formatMoney(d.expenses)} />
                            <Stat label={t("stock.p8.rep.creditGiven")} value={formatMoney(d.credit_given)} />
                            <Stat label={t("stock.p8.rep.netMoney")} value={formatMoney(d.net_money)} hint={t("stock.p8.rep.netMoneyHint")} />
                            <Stat label={t("stock.p8.rep.onPlatform")} value={formatMoney(d.on_platform.net_revenue)} hint={t("stock.p8.rep.onPlatformDay", { orders: d.on_platform.orders })} />
                        </dl>
                        <h3 className="font-medium text-sm mb-2">{t("stock.p8.rep.byMethod")}</h3>
                        {Object.keys(d.money.by_method).length === 0 ? <p className="text-sm text-ash">{t("stock.p8.rep.noMoney")}</p> : (
                            <ul className="divide-y divide-line border border-line rounded-lg">
                                {Object.entries(d.money.by_method).map(([m, v]) => (
                                    <li key={m} className="p-3 flex justify-between text-sm"><span>{t(`stock.trade.method.${m}`)}</span><span className="price">{formatMoney(v.net)}</span></li>))}
                            </ul>
                        )}
                    </div>
                )}
            </Body>
        </div>
    );
}

function Debts() {
    const { t } = useLanguage();
    const report = useReport("debts", {});
    const group = (title, g) => (
        <section className="mb-6">
            <h3 className="font-medium text-sm mb-1">{title}: <span className="price">{formatMoney(g.total_owed)}</span></h3>
            <p className="text-xs text-ash mb-2">{t("stock.p8.rep.ageing", { a: formatMoney(g.ageing["0_30"]), b: formatMoney(g.ageing["31_60"]), c: formatMoney(g.ageing["61_plus"]) })}</p>
            {g.items.length === 0 ? <p className="text-sm text-ash">{t("stock.p8.rep.noDebts")}</p> : (
                <ul className="divide-y divide-line border border-line rounded-lg">
                    {g.items.map((r) => (
                        <li key={r.id} className="p-3 flex justify-between gap-3 text-sm">
                            <span>{r.name}{r.phone ? <span className="text-ash"> · {r.phone}</span> : null}<span className="block text-xs text-ash">{t("stock.p8.rep.oldest", { days: r.oldest_days })}</span></span>
                            <span className="price font-medium">{formatMoney(r.owed)}</span>
                        </li>))}
                </ul>
            )}
        </section>
    );
    return <Body report={report}>{(d) => <div>{group(t("stock.p8.rep.customersOwe"), d.customers)}{group(t("stock.p8.rep.youOwe"), d.suppliers)}</div>}</Body>;
}

// Reports: money, stock and debts, always in Africa/Dar_es_Salaam days.
export default function StockReports() {
    const { t } = useLanguage();
    const base = useStockBase();
    const { access } = useOutletContext() || {};
    const costOk = !!access?.features?.stock_cost_reports;
    const [tab, setTab] = useState("overview");
    const [range, setRange] = useState({ from: daysAgoDar(29), to: todayDar() });
    const needsRange = tab === "overview" || tab === "best";
    const stableRange = useMemo(() => range, [range]);

    if (access && !access.features?.stock_reports) return <Locked base={base} />;

    return (
        <div>
            <div role="tablist" aria-label={t("stock.p8.rep.title")} className="flex gap-1 overflow-x-auto mb-4">
                {TABS.map((id) => (
                    <button key={id} role="tab" type="button" id={`rep-tab-${id}`} aria-selected={tab === id} aria-controls="rep-panel" onClick={() => setTab(id)}
                        className={`min-h-[44px] px-3 rounded-md border text-sm whitespace-nowrap focus-ring ${tab === id ? "border-ink font-medium" : "border-line text-ash"}`}>{t(`stock.p8.rep.tab.${id}`)}</button>
                ))}
            </div>
            <div role="tabpanel" id="rep-panel" aria-labelledby={`rep-tab-${tab}`}>
                {needsRange && <RangeBar range={range} setRange={setRange} />}
                {tab === "overview" && <Overview range={stableRange} base={base} />}
                {tab === "best" && <Best range={stableRange} base={base} costOk={costOk} />}
                {tab === "low" && <Low />}
                {tab === "valuation" && <Valuation base={base} costOk={costOk} />}
                {tab === "close" && <Close />}
                {tab === "debts" && <Debts />}
            </div>
        </div>
    );
}
