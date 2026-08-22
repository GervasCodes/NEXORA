import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../../api/client";
import PageMeta from "../../components/PageMeta";
import PageLoader from "../../components/PageLoader";
import { formatDate } from "../../utils/format";

export default function SellerTaxInfo() {
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
            setMessage("Tax info submitted. An admin will verify it before fiscal receipts start being issued.");
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <PageLoader />;

    return (
        <div>
            <PageMeta title="Tax & fiscal receipts" noIndex />
            <h1 className="font-display text-2xl mb-1">Tax & fiscal receipts (EFD)</h1>
            <p className="text-ash text-sm mb-8">
                Register your TIN to have TRA-compliant fiscal receipts issued automatically for your paid orders.
            </p>

            {taxInfo?.tin && (
                <div className="border border-line rounded-lg p-4 mb-8 text-sm">
                    <p className="font-medium mb-1">
                        {taxInfo.efd_registered ? "✅ Verified" : "⏳ Pending admin verification"}
                    </p>
                    <p className="text-ash">TIN: {taxInfo.tin}{taxInfo.vrn ? ` · VRN: ${taxInfo.vrn}` : ""}</p>
                </div>
            )}

            <form onSubmit={submit} className="space-y-4 mb-10">
                <div>
                    <label htmlFor="efd-tin" className="block text-sm mb-1">TIN (9 digits)</label>
                    <input
                        id="efd-tin"
                        required
                        pattern="\d{9}"
                        value={tin}
                        onChange={(e) => setTin(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    />
                </div>
                <div>
                    <label htmlFor="efd-vrn" className="block text-sm mb-1">VRN (optional, if VAT-registered)</label>
                    <input
                        id="efd-vrn"
                        value={vrn}
                        onChange={(e) => setVrn(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2 text-sm focus-ring"
                    />
                </div>

                {message && <p className="text-sm text-teal">{message}</p>}
                {error && <p className="text-sm text-coral">{error}</p>}

                <button
                    type="submit"
                    disabled={submitting}
                    className="bg-ink text-paper px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                    {submitting ? "Submitting…" : "Submit"}
                </button>
            </form>

            <h2 className="font-display text-lg mb-3">Fiscal receipts</h2>
            {receipts.length === 0 ? (
                <p className="text-ash text-sm">No fiscal receipts yet.</p>
            ) : (
                <ul className="space-y-2">
                    {receipts.filter((r) => r.status !== "not_applicable").map((r) => (
                        <li key={r.id} className="border-b border-line pb-2 text-sm">
                            <div className="flex justify-between">
                                <span>Order {r.order_number}</span>
                                <span className="capitalize text-ash">{r.status}</span>
                            </div>
                            {r.fiscal_receipt_number && (
                                <p className="text-xs text-ash mt-0.5">
                                    Receipt {r.fiscal_receipt_number} · Verification code {r.verification_code}
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
