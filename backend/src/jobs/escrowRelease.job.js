
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
