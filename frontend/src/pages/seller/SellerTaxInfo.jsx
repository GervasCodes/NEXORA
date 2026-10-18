import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import PageLoader from "../../components/PageLoader";
import { formatDate } from "../../utils/format";
import EmptyState from "../../components/ui/EmptyState";
import { VerifiedBadgeIcon, HourglassIcon } from "../../components/Icons";
import Input from "../../components/ui/Input";
import { useLanguage } from "../../context/LanguageContext";

export default function SellerTaxInfo() {
    const { t } = useLanguage();
    const [taxInfo, setTaxInfo] = useState(null);
    const [receipts, setReceipts] = useState([]);
    const [loading, setLoading] = useState(true);

    const [tin, setTin] = useState("");
    const [vrn, setVrn] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const load = () => {
        Promise.all([
            api.get("/efd/seller/tax-info").then(({ data }) => data.data),
            api.get("/efd/seller/receipts").then(({ data }) => data.data)
        ]).then(([info, receiptsData]) => {
            setTaxInfo(info);
            setReceipts(receiptsData);
            if (info?.tin) setTin(info.tin);
            if (info?.vrn) setVrn(info.vrn);
        }).finally(() => setLoading(false));
    };

    useEffect(load, []);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        setMessage("");
        try {
            const { data } = await api.put("/efd/seller/tax-info", { tin, vrn: vrn || undefined });
            setTaxInfo(data.data);
            setMessage(t("seller.tax.submitted"));
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title={t("seller.tax.metaTitle")} noIndex />
            <h1 className="font-display text-2xl mb-1">{t("seller.tax.title")}</h1>
            <p className="text-ash text-sm mb-8">
                {t("seller.tax.intro")}
            </p>

            {taxInfo?.tin && (
                <div className="border border-line rounded-lg p-4 mb-8 text-sm">
                    <p className="font-medium mb-1 flex items-center gap-1.5">
                        {taxInfo.efd_registered ? (
                            <>
                                <VerifiedBadgeIcon className="w-4 h-4 text-mango shrink-0" />
                                {t("seller.tax.verified")}
                            </>
                        ) : (
                            <>
                                <HourglassIcon className="w-4 h-4 text-ash shrink-0" />
                                {t("seller.tax.pending")}
                            </>
                        )}
                    </p>
                    <p className="text-ash">{t("seller.tax.tinLine", { tin: taxInfo.tin })}{taxInfo.vrn ? ` · ${t("seller.tax.vrnLine", { vrn: taxInfo.vrn })}` : ""}</p>
                </div>
            )}

            <form onSubmit={submit} className="space-y-4 mb-10">
                <Input
                    id="efd-tin"
                    label={t("seller.tax.tinLabel")}
                    required
                    pattern="\d{9}"
                    value={tin}
                    onChange={(e) => setTin(e.target.value)}
                />
                <Input
                    id="efd-vrn"
                    label={t("seller.tax.vrnLabel")}
                    value={vrn}
                    onChange={(e) => setVrn(e.target.value)}
                />

                {message && <p className="text-sm text-teal">{message}</p>}
                {error && <p className="text-sm text-coral">{error}</p>}

                <button
                    type="submit"
                    disabled={submitting}
                    className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                    {submitting ? t("seller.tax.submitting") : t("seller.tax.submit")}
                </button>
            </form>

            <h2 className="font-display text-lg mb-3">{t("seller.tax.receipts")}</h2>
            {receipts.length === 0 ? (
                <EmptyState title={t("seller.tax.noReceipts")} />
            ) : (
                <ul className="space-y-2">
                    {receipts.filter((r) => r.status !== "not_applicable").map((r) => (
                        <li key={r.id} className="border-b border-line pb-2 text-sm">
                            <div className="flex justify-between">
                                <span>{t("seller.tax.order", { number: r.order_number })}</span>
                                <span className="capitalize text-ash">{["pending", "issued", "failed"].includes(r.status) ? t(`seller.tax.status.${r.status}`) : r.status}</span>
                            </div>
                            {r.fiscal_receipt_number && (
                                <p className="text-xs text-ash mt-0.5">
                                    {t("seller.tax.receiptLine", { number: r.fiscal_receipt_number, code: r.verification_code })}
                                </p>
                            )}
                            <p className="text-xs text-ash">{formatDate(r.created_at)}</p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
