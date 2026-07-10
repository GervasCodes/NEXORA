/**
 * Dev-only fallback so checkout/payout flows can be built and tested
 * without real provider credentials. Never used in production — see the
 * guard in mobileMoney.provider.js.
 */

exports.initiate = (phone, amount) => {
    console.warn(
        "\n" +
        "=============================================================\n" +
        "  SIMULATED MOBILE MONEY PAYMENT — no real charge occurred.\n" +
        `  phone=${phone} amount=${amount}\n` +
        "  Set MOBILE_MONEY_PROVIDER + matching credentials in .env to\n" +
        "  use a real provider (malipopay or selcom).\n" +
        "=============================================================\n"
    );

    return Promise.resolve({
        success: true,
        transactionReference: `SIMULATED-${Date.now()}`
    });
};

exports.disburse = (phone, amount) => {
    console.warn(
        "\n" +
        "=============================================================\n" +
        "  SIMULATED MOBILE MONEY PAYOUT — no real transfer occurred.\n" +
        `  phone=${phone} amount=${amount}\n` +
        "=============================================================\n"
    );

    return Promise.resolve({
        success: true,
        transactionReference: `SIMULATED-PAYOUT-${Date.now()}`
    });
};
