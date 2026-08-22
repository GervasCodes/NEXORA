import { useEffect, useState } from "react";
import api from "../api/client";

// Deliberately self-contained (own fetch, own state) rather than
// threaded through OrderDetail.jsx's own load effect - a missing/failed
// EFD lookup should never block or complicate the order page itself
// rendering, it's a small supplementary badge.
export default function FiscalReceiptBadge({ orderId }) {
    const [receipt, setReceipt] = useState(null);

    useEffect(() => {
        let cancelled = false;
        api.get(`/efd/order/${orderId}`)
            .then(({ data }) => { if (!cancelled) setReceipt(data.data); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [orderId]);

    if (!receipt || receipt.status !== "issued") return null;

    return (
        <p className="text-xs text-ash mt-1">
            Fiscal receipt {receipt.fiscal_receipt_number} · Verification code {receipt.verification_code}
        </p>
    );
}
