import { useCallback, useEffect, useState } from "react";
import Button from "../../../components/ui/Button";
import { useLanguage } from "../../../context/LanguageContext";
import { useToast } from "../../../context/ToastContext";
import { formatMoney } from "../../../utils/format";
import { discardQueued, flushQueue, isPersistent, listQueue, subscribeQueue } from "../../../utils/stockOfflineStore";

// Sales saved on this device while offline: how many are waiting, a "send now" button, and the
// ones the server refused (with the reason) so they can be looked at and discarded. Sending
// also happens by itself when the connection comes back (NetworkStatusNotice).
export default function OfflineQueueBanner() {
    const { t } = useLanguage();
    const toast = useToast();
    const [entries, setEntries] = useState([]);
    const [busy, setBusy] = useState(false);
    const [persistent, setPersistent] = useState(true);

    const refresh = useCallback(() => { listQueue().then(setEntries).catch(() => {}); }, []);
    useEffect(() => {
        refresh();
        isPersistent().then(setPersistent);
        const unsub = subscribeQueue(refresh);
        if (typeof navigator === "undefined" || navigator.onLine !== false) flushQueue().then((r) => { if (r.flagged) toast?.error(t("stock.p8.off.flagged", { count: r.flagged })); });
        return unsub;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh]);

    const pending = entries.filter((e) => e.status === "pending");
    const rejected = entries.filter((e) => e.status === "rejected");
    if (!pending.length && !rejected.length) return null;

    const send = async () => {
        setBusy(true);
        const r = await flushQueue();
        setBusy(false);
        if (r.blocked === "offline") toast?.error(t("stock.p8.off.stillOffline"));
        else if (r.blocked === "plan") toast?.error(t("stock.p8.off.planBlocked"));
        else if (r.blocked === "server") toast?.error(t("stock.p8.off.serverError"));
        else toast?.success(t("stock.p8.off.sent", { count: r.synced + r.replayed }));
        if (r.flagged) toast?.error(t("stock.p8.off.flagged", { count: r.flagged }));
    };

    return (
        <div className="mb-4 border border-line rounded-lg p-3 bg-mango/10" aria-live="polite">
            {pending.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm"><strong>{t("stock.p8.off.waiting", { count: pending.length })}</strong>{" "}{t("stock.p8.off.waitingHint")}</p>
                    <Button type="button" size="sm" className="min-h-[44px]" onClick={send} disabled={busy}>{busy ? t("stock.saving") : t("stock.p8.off.sendNow")}</Button>
                </div>
            )}
            {!persistent && <p className="text-xs text-coral mt-2">{t("stock.p8.off.notSaved")}</p>}
            {rejected.length > 0 && (
                <div className="mt-3">
                    <p className="text-sm font-medium text-coral">{t("stock.p8.off.rejected", { count: rejected.length })}</p>
                    <ul className="mt-1 divide-y divide-line">
                        {rejected.map((e) => (
                            <li key={e.key} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span>{e.summary?.lines?.map((l) => `${l.quantity} × ${l.name}`).join(", ")} {e.summary?.total != null ? `· ${formatMoney(e.summary.total)}` : ""}<br /><span className="text-coral">{e.message}</span></span>
                                <Button type="button" variant="ghost" size="sm" className="min-h-[44px]" onClick={() => discardQueued(e.key)}>{t("stock.p8.off.discard")}</Button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
