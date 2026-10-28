import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { extractErrorMessage } from "../../../api/client";
import { getStockAccess, listStockItems } from "../../../api/stock";
import PageMeta from "../../../components/PageMeta";
import Skeleton from "../../../components/Skeleton";
import ErrorState from "../../../components/ui/ErrorState";
import { useLanguage } from "../../../context/LanguageContext";
import OfflineQueueBanner from "./OfflineQueueBanner";
import useStockBase from "./useStockBase";

// Nexora Stock Management shell: title, tabs and the plan gate. Phase 8: access follows the
// plan's entitlements (GET /seller/stock/access) - the API answers SUBSCRIPTION_REQUIRED when
// there is no plan and FEATURE_NOT_IN_PLAN when the plan lacks Stock Management. After a plan
// ends, the stock stays viewable and exportable for a grace period (read-only banner).
export default function StockLayout() {
    const { t } = useLanguage();
    const base = useStockBase();
    const toolsOnly = base === "/business";
    const { pathname } = useLocation();
    const [gate, setGate] = useState(null); // null = probing, "open", "locked", "notInPlan"
    const [access, setAccess] = useState(null);
    const [itemCount, setItemCount] = useState(null);
    const [error, setError] = useState("");

    const probe = useCallback(() => {
        setGate(null);
        setError("");
        getStockAccess()
            .then((a) => {
                setAccess(a);
                setGate("open");
                if (a.features?.stock_max_items) {
                    listStockItems({ limit: 1 }).then((d) => setItemCount(d.summary?.items ?? null)).catch(() => {});
                }
            })
            .catch((err) => {
                const code = err.response?.data?.code;
                if (code === "SUBSCRIPTION_REQUIRED") setGate("locked");
                else if (code === "FEATURE_NOT_IN_PLAN") setGate("notInPlan");
                else setError(extractErrorMessage(err));
            });
    }, []);
    useEffect(probe, [probe]);

    const section = pathname.split("/stock")[1] || "";
    const tabs = [
        { to: `${base}/stock/sell`, label: t("stock.trade.tabSell"), active: section.startsWith("/sell") },
        { to: `${base}/stock/sales`, label: t("stock.trade.tabSales"), active: section.startsWith("/sales") },
        { to: `${base}/stock`, label: t("stock.tabItems"), active: section === "" || section === "/" || section.startsWith("/items") },
        { to: `${base}/stock/purchases`, label: t("stock.trade.tabPurchases"), active: section.startsWith("/purchases") },
        { to: `${base}/stock/expenses`, label: t("stock.p8.tabExpenses"), active: section.startsWith("/expenses") },
        { to: `${base}/stock/reports`, label: t("stock.p8.tabReports"), active: section.startsWith("/reports") },
        { to: `${base}/stock/customers`, label: t("stock.trade.tabCustomers"), active: section.startsWith("/customers") },
        { to: `${base}/stock/suppliers`, label: t("stock.trade.tabSuppliers"), active: section.startsWith("/suppliers") },
        { to: `${base}/stock/movements`, label: t("stock.tabMovements"), active: section.startsWith("/movements") },
        { to: `${base}/stock/import-export`, label: t("stock.p8.tabImportExport"), active: section.startsWith("/import-export") },
        { to: toolsOnly ? "/business/classic" : "/seller/pos", label: t("stock.tabClassic"), active: false }
    ];

    const header = (
        <>
            <PageMeta title={t("stock.title")} noIndex />
            <h1 className="font-display text-2xl mb-1">{t("stock.title")}</h1>
            <p className="text-ash text-sm mb-6">{t("stock.subtitle")}</p>
        </>
    );

    if (error) return <div>{header}<ErrorState title={t("stock.loadError")} hint={error} onRetry={probe} /></div>;

    if (gate === "locked" || gate === "notInPlan") {
        const notInPlan = gate === "notInPlan";
        return (
            <div>
                {header}
                <div className="max-w-md glass-strong rounded-lg p-5">
                    <h2 className="font-display text-lg mb-1">{notInPlan ? t("stock.p8.gate.notInPlanTitle") : t("trial.gate.posTitle")}</h2>
                    <p className="text-sm text-ash mb-4">{notInPlan ? t("stock.p8.gate.notInPlanBody") : t("trial.gate.posBody")}</p>
                    <Link to={toolsOnly ? "/business/plan" : "/seller/subscription"}
                        className="inline-flex items-center justify-center w-full min-h-[44px] bg-ink text-white px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
                        {t("seller.pos.gateCta")}
                    </Link>
                </div>
            </div>
        );
    }

    if (gate === null) {
        return (
            <div aria-busy="true">
                {header}
                <Skeleton className="h-10 w-full mb-4" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {header}
            <nav aria-label={t("stock.title")} className="flex gap-1 border-b border-line mb-6 overflow-x-auto">
                {tabs.map((tab) => (
                    <Link key={tab.to} to={tab.to} aria-current={tab.active ? "page" : undefined}
                        className={`inline-flex items-center min-h-[44px] px-4 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors focus-ring ${
                            tab.active ? "border-ink text-ink font-medium" : "border-transparent text-ash hover:text-ink"
                        }`}>
                        {tab.label}
                    </Link>
                ))}
            </nav>
            {access?.read_only && (
                <div role="status" className="mb-4 border border-line rounded-lg p-3 bg-coral/10 text-sm">
                    <strong>{t("stock.p8.gate.readOnlyTitle")}</strong>{" "}
                    {t("stock.p8.gate.readOnlyBody", { days: access.grace_ends_in_days ?? 0 })}{" "}
                    <Link to={toolsOnly ? "/business/plan" : "/seller/subscription"} className="underline font-medium focus-ring">{t("seller.pos.gateCta")}</Link>
                </div>
            )}
            {access?.features?.stock_max_items && itemCount !== null && itemCount > access.features.stock_max_items && (
                <div role="note" className="mb-4 border border-line rounded-lg p-3 bg-mango/10 text-sm">
                    {t("stock.p8.gate.softLimit", { count: itemCount, max: access.features.stock_max_items })}{" "}
                    <Link to={toolsOnly ? "/business/plan" : "/seller/subscription"} className="underline font-medium focus-ring">{t("seller.pos.gateCta")}</Link>
                </div>
            )}
            <OfflineQueueBanner />
            <Outlet context={{ access }} />
        </div>
    );
}
