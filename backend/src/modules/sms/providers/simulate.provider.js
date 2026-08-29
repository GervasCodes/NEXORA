/**
 * Dev-only fallback so the SMS integration can be built/tested without
 * real gateway credentials. Never used in production - see the guard in
 * sms.provider.js (mirrors whatsapp/providers/simulate.provider.js).
 */

exports.sendText = (to, body) => {
    console.warn(
        "\n" +
        "=============================================================\n" +
        "  SIMULATED SMS MESSAGE — nothing was actually sent.\n" +
        `  to=${to}\n` +
        `  body=${body}\n` +
        "  Set SMS_GATEWAY_API_KEY + SMS_GATEWAY_SECRET_KEY in .env\n" +
        "  to send real messages via the gateway.\n" +
        "=============================================================\n"
    );

    return Promise.resolve({ success: true, messageId: `SIMULATED-${Date.now()}` });
};
