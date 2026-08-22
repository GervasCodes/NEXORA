/**
 * Tanzania Revenue Authority (TRA) VFD (Virtual Fiscal Device) API
 * adapter.
 *
 * TRA's actual VFD Web API (for taxpayers who don't have a physical
 * EFD) requires per-taxpayer enrollment before you get real endpoint
 * URLs and credentials - there is no generic sandbox to point at from
 * here the way MalipoPay/Selcom at least document a public developer
 * portal for (see payment/providers/selcom.provider.js's header
 * comment for the same situation with a payment provider). The request/
 * response shape below is this integration's best-effort structure
 * based on TRA's publicly described VFD receipt format (TIN, VRN,
 * receipt items, verification code) - CONFIRM THE ACTUAL ENDPOINT URL,
 * AUTH SCHEME, AND PAYLOAD FIELD NAMES WITH TRA (or the taxpayer's
 * assigned VFD service provider - TRA operates this through certified
 * intermediaries, not always directly) before sending anything from
 * this file to production. Until then, `simulate.provider.js` is what
 * actually runs (see providers/efd.provider.js's router).
 */

const BASE_URL = process.env.TRA_VFD_BASE_URL;
const API_KEY = process.env.TRA_VFD_API_KEY;

exports.isConfigured = () => Boolean(BASE_URL && API_KEY);

exports.submitInvoice = async ({ sellerTin, sellerVrn, buyerName, buyerPhone, items, totalAmount, orderNumber }) => {
    const response = await fetch(`${BASE_URL}/api/vfd/receipts`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            tin: sellerTin,
            vrn: sellerVrn || undefined,
            customerName: buyerName,
            customerPhone: buyerPhone,
            reference: orderNumber,
            items: items.map((item) => ({
                description: item.name,
                quantity: item.quantity,
                unitPrice: item.unit_price,
                total: item.subtotal
            })),
            totalAmount
        })
    });

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        return { success: false, error: `TRA VFD API returned ${response.status}: ${body}`.slice(0, 500) };
    }

    const data = await response.json();
    return {
        success: true,
        fiscalReceiptNumber: data.receiptNumber,
        verificationCode: data.verificationCode,
        raw: data
    };
};
