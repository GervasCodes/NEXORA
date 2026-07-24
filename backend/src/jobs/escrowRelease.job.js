// Phase 9D - Seller Release. Runs on a schedule (see jobs/index.js) and
// releases held seller earnings (Phase 9C's held_balance) into
// withdrawable balance once an order is delivered and
// settings.escrow_hold_days has elapsed with no open dispute - see
// docs/ESCROW_ANALYSIS.md for the full design and
// wallet.service.js#releaseEligibleEarnings for the actual release/
// freeze/close-by-dispute logic. This job is a thin scheduling wrapper
// around that function, matching the shape of every other job in this
// directory.
const walletService = require("../modules/wallet/wallet.service");

exports.run = async () => {
    const summary = await walletService.releaseEligibleEarnings();

    if (summary.released || summary.closedByDispute || summary.frozen) {
        console.log(
            `[escrowRelease job] released ${summary.released} item(s) ` +
            `(${summary.amountReleased}), closed ${summary.closedByDispute} ` +
            `item(s) already reversed by dispute, froze ${summary.frozen} ` +
            `item(s) with an open dispute`
        );
    }
};
