/**
 * Dev-only fallback so EFD receipt issuance can be built/tested without
 * real TRA VFD credentials. Never used in production - see the guard in
 * providers/efd.provider.js (mirrors payment/providers/simulate.provider.js).
 */

const crypto = require("crypto");

exports.submitInvoice = ({ orderNumber }) => {
    const fiscalReceiptNumber = `SIM-${Date.now()}`;
    const verificationCode = crypto.randomBytes(6).toString("hex").toUpperCase();

    console.warn(
        "\n" +
        "=============================================================\n" +
        "  SIMULATED EFD RECEIPT — not actually submitted to TRA.\n" +
        `  order=${orderNumber}\n` +
        `  fiscalReceiptNumber=${fiscalReceiptNumber}\n` +
        `  verificationCode=${verificationCode}\n` +
        "  Set TRA_VFD_BASE_URL + TRA_VFD_API_KEY in .env once TRA/your\n" +
        "  VFD service provider issues real credentials.\n" +
        "=============================================================\n"
    );

    return Promise.resolve({
        success: true,
        fiscalReceiptNumber,
        verificationCode,
        raw: { simulated: true }
    });
};
