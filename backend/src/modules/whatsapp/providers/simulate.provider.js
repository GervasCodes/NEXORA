/**
 * Dev-only fallback so the WhatsApp integration can be built/tested
 * without real Cloud API credentials. Never used in production - see
 * the guard in provider.js (mirrors payment/providers/simulate.provider.js).
 */

exports.sendText = (to, body) => {
    console.warn(
        "\n" +
        "=============================================================\n" +
        "  SIMULATED WHATSAPP MESSAGE — nothing was actually sent.\n" +
        `  to=${to}\n` +
        `  body=${body}\n` +
        "  Set WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN in .env\n" +
        "  to send real messages via the Cloud API.\n" +
        "=============================================================\n"
    );

    return Promise.resolve({ success: true, messageId: `SIMULATED-${Date.now()}` });
};
