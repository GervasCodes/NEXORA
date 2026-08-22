import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import PageMeta from "../components/PageMeta";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { formatDate } from "../utils/format";
import PageLoader from "../components/PageLoader";
import { useLanguage } from "../context/LanguageContext";

const STATUS_STYLES = {
    requested: "bg-mango/20 text-mango-dark",
    approved: "bg-azure/10 text-azure",
    shipped_back: "bg-azure/10 text-azure",
    received: "bg-azure/10 text-azure",
    refunded: "bg-teal text-white",
    rejected: "bg-coral/10 text-coral",
    cancelled: "bg-line text-ash"
};

export default function ReturnDetail() {
    const { id } = useParams();
    const { user } = useAuth();
    const { format } = useCurrency();
    const { t } = useLanguage();

    const [ret, setRet] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");

    const [trackingNumber, setTrackingNumber] = useState("");
    const [carrier, setCarrier] = useState("");
    const [rejectReason, setRejectReason] = useState("");
    const [showReject, setShowReject] = useState(false);

    const load = () => {
        api.get(`/returns/${id}`)
            .then(({ data }) => setRet(data.data))
            .catch((err) => setLoadError(extractErrorMessage(err)))
            .finally(() => setLoading(false));
    };

    useEffect(load, [id]);

    const isBuyer = user?.role === "buyer" && ret?.buyer_id === user.id;
    const isSellerOrAdmin = user?.role === "seller" || user?.role === "admin";
    const base = user?.role === "admin" ? "/returns/admin" : "/returns/seller";

    const run = async (action, path, body) => {
        setBusy(action);
        setError("");
        try {
            await api.put(path, body || {});
            load();
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setBusy("");
        }
    };

    if (loading) return <PageLoader />;

    if (loadError || !ret) {
        return (
            <div className="max-w-xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">{t("return.new.loadErrorTitle")}</p>
                <p className="text-ash text-sm mb-4">{loadError}</p>
                <Link to="/returns" className="text-teal hover:underline text-sm">{t("returns.title")}</Link>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title={t("returns.title")} noIndex />
            <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
                <h1 className="font-display text-2xl">Return #{ret.id}</h1>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${STATUS_STYLES[ret.status] || "bg-line text-ash"}`}>
                    {ret.status.replace("_", " ")}
                </span>
            </div>
            <p className="text-ash text-sm mb-1">{t(`return.reason.${ret.reason}`)}</p>
            {ret.description && <p className="text-sm mb-4">{ret.description}</p>}
            {ret.refund_amount && (
                <p className="text-sm text-teal mb-4">{t("dispute.list.refundApproved")}: {format(ret.refund_amount)}</p>
            )}
            {ret.rejection_reason && (
                <p className="text-sm text-coral mb-4">{ret.rejection_reason}</p>
            )}

            {error && <p className="text-sm text-coral mb-4">{error}</p>}

            <div className="space-y-3 mb-8">
                {isBuyer && ["requested", "approved"].includes(ret.status) && (
                    <button
                        disabled={busy === "cancel"}
                        onClick={() => run("cancel", `/returns/${id}/cancel`)}
                        className="text-sm border border-line px-4 py-2 rounded-md hover:border-ink transition-colors disabled:opacity-60"
                    >
                        {busy === "cancel" ? "…" : t("return.new.cancel")}
                    </button>
                )}

                {isBuyer && ret.status === "approved" && (
                    <div className="border border-line rounded-md p-3 space-y-2">
                        <input
                            value={trackingNumber}
                            onChange={(e) => setTrackingNumber(e.target.value)}
                            placeholder="Tracking number"
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        />
                        <input
                            value={carrier}
                            onChange={(e) => setCarrier(e.target.value)}
                            placeholder="Carrier (optional)"
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                        />
                        <button
                            disabled={busy === "ship" || !trackingNumber.trim()}
                            onClick={() => run("ship", `/returns/${id}/ship-back`, { tracking_number: trackingNumber, carrier })}
                            className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                        >
                            {busy === "ship" ? "…" : "Mark shipped back"}
                        </button>
                    </div>
                )}

                {isSellerOrAdmin && ret.status === "requested" && !showReject && (
                    <div className="flex gap-3">
                        <button
                            disabled={busy === "approve"}
                            onClick={() => run("approve", `${base}/${id}/approve`)}
                            className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                        >
                            {busy === "approve" ? "…" : "Approve"}
                        </button>
                        <button
                            onClick={() => setShowReject(true)}
                            className="text-sm border border-line px-4 py-2 rounded-md hover:border-ink transition-colors"
                        >
                            Reject
                        </button>
                    </div>
                )}

                {isSellerOrAdmin && showReject && (
                    <div className="border border-line rounded-md p-3 space-y-2">
                        <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Reason for rejecting"
                            rows={3}
                            className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring resize-none"
                        />
                        <div className="flex gap-3">
                            <button
                                disabled={busy === "reject" || !rejectReason.trim()}
                                onClick={() => run("reject", `${base}/${id}/reject`, { reason: rejectReason })}
                                className="bg-coral text-paper px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                            >
                                {busy === "reject" ? "…" : "Confirm reject"}
                            </button>
                            <button
                                onClick={() => setShowReject(false)}
                                className="text-sm border border-line px-4 py-2 rounded-md hover:border-ink transition-colors"
                            >
                                {t("return.new.cancel")}
                            </button>
                        </div>
                    </div>
                )}

                {isSellerOrAdmin && ret.status === "shipped_back" && (
                    <button
                        disabled={busy === "receive"}
                        onClick={() => run("receive", `${base}/${id}/received`)}
                        className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {busy === "receive" ? "…" : "Mark received & refund"}
                    </button>
                )}
            </div>

            <h2 className="font-display text-lg mb-3">History</h2>
            <ul className="space-y-2">
                {ret.history?.map((h) => (
                    <li key={h.id} className="text-sm border-l-2 border-line pl-3">
                        <p className="capitalize">{h.action.replace("_", " ")}</p>
                        {h.note && <p className="text-ash text-xs">{h.note}</p>}
                        <p className="text-ash text-xs">{formatDate(h.created_at)}</p>
                    </li>
                ))}
            </ul>
        </div>
    );
}
