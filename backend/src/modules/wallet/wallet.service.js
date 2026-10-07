const db = require("../../config/db");
const { maskPayoutDetails } = require("../../utils/maskPayout");
const auditRepository = require("../audit/audit.repository");
const walletRepository = require("./wallet.repository");
const orderRepository = require("../order/order.repository");
const logger = require("../../utils/logger").child({ module: "wallet" });
const Sentry = require("../../config/sentry");
const disputeRepository = require("../dispute/dispute.repository");
const settingsService = require("../settings/settings.service");
const notificationService = require("../notification/notification.service");
const fraudService = require("../fraud/fraud.service");

// Called once an order's payment is confirmed (mobile money success, or a
// Cash on Delivery confirmation). Splits the order's line items by seller,
// applies the platform's current commission rate, and credits each
// seller's wallet with their net amount. Idempotent: only touches
// order_items rows that haven't been credited yet, so it's safe to call
// more than once for the same order.
//
// Escrow  which wallet column gets credited depends on the
// order's payment method. For mobile money / Snippe / PayPal, the
// platform actually holds the buyer's money from the moment the provider
// webhook confirms payment - so the seller's earnings go into
// `held_balance` (not withdrawable) and stay there until Phase 9D's
// release job (delivered + escrow_hold_days elapsed, no open dispute)
// moves them into `balance`. Cash on Delivery is different: the seller
// already has the cash in hand by the time `confirmDeliveryReceipt` can
// even run (it requires the order to already be `delivered`, and is now
// a buyer-only action per  - see payment.service.js), so there
// is no platform-held money to hold back - COD earnings go straight to
// `balance`, exactly as every payment method did before this phase, and
// the corresponding order_items rows are marked `wallet_released = TRUE`
// immediately so Phase 9D's release job never picks them up. See
// docs/ESCROW_ANALYSIS.md section 3.2 for the reasoning, and
// docs/ESCROW_LICENSING_REVIEW.md (Phase 1, Launch Blockers) for the
// money-transmission/e-money licensing questions this pattern raises -
// get that reviewed by a lawyer before this handles real money.
exports.creditSellersForOrder = async (orderId) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const items = await walletRepository.findUncreditedItemsByOrder(orderId, connection);

        if (items.length === 0) {
            await connection.commit();
            return;
        }

        const order = await orderRepository.findOrderById(orderId);
        const isCod = order && order.payment_method === "cash_on_delivery";
        const isEscrowed = order && !isCod;

        // Revenue & Product Enhancements roadmap: commission is no longer
        // one flat platform rate for every seller - a seller on a paid
        // subscription plan may have a lower commission_rate_override
        // (see subscription.service.js#getEffectiveCommissionRate, which
        // falls back to settingsService.getCommissionRate() for anyone on
        // the Free plan).
        //
        // Commission at checkout (Phase 2): order.service.js#checkout now
        // snapshots each item's commission_rate/commission_amount/
        // seller_net_amount at the moment the order was placed, and that
        // stored figure is used here unchanged - a seller's plan changing
        // (or an admin editing the commission rate) between checkout and
        // payment confirmation must never rewrite what an already-placed
        // order earns the seller. Only order_items rows that predate this
        // migration (commission_rate IS NULL) still fall back to computing
        // it fresh, once per distinct seller, exactly as before Phase 2.
        const subscriptionService = require("../subscription/subscription.service");
        const legacySellerIds = [...new Set(
            items.filter((item) => item.commission_rate === null).map((item) => item.seller_id)
        )];
        const legacyRateBySeller = new Map(
            await Promise.all(
                legacySellerIds.map(async (sellerId) => [
                    sellerId, await subscriptionService.getEffectiveCommissionRate(sellerId)
                ])
            )
        );

        // Group this order's uncredited items by seller so a multi-vendor
        // order results in one wallet transaction per seller.
        // rateBySeller is tracked alongside bySeller purely for the ledger
        // description text below.
        const bySeller = new Map();
        const rateBySeller = new Map();
        // (Backend N+1 Fixes & Read Replica Adoption): this loop
        // only computes each item's commission figures in memory - the DB
        // write happens once, in the batched markItemsCredited call below.
        const itemsToCredit = [];
        for (const item of items) {
            const commissionRate = item.commission_rate !== null
                ? Number(item.commission_rate)
                : legacyRateBySeller.get(item.seller_id);
            const sellerSubtotal = Number(item.subtotal);
            const commissionAmount = item.commission_amount !== null
                ? Number(item.commission_amount)
                : Number((sellerSubtotal * (commissionRate / 100)).toFixed(2));
            const netAmount = item.seller_net_amount !== null
                ? Number(item.seller_net_amount)
                : Number((sellerSubtotal - commissionAmount).toFixed(2));

            itemsToCredit.push({ id: item.id, commissionRate, commissionAmount, netAmount });

            const existing = bySeller.get(item.seller_id) || { netTotal: 0, commissionTotal: 0 };
            existing.netTotal = Number((existing.netTotal + netAmount).toFixed(2));
            existing.commissionTotal = Number((existing.commissionTotal + commissionAmount).toFixed(2));
            bySeller.set(item.seller_id, existing);
            rateBySeller.set(item.seller_id, commissionRate);
        }

        await walletRepository.markItemsCredited(itemsToCredit, !isEscrowed, connection);

        for (const [sellerId, totals] of bySeller.entries()) {
            await walletRepository.ensureWallet(sellerId, connection);
            await walletRepository.getWalletForUpdate(sellerId, connection);
            const sellerCommissionRate = rateBySeller.get(sellerId);

            if (isCod) {
                // Cash on Delivery fix (Phase 2, P0): the seller's own
                // agent already collected the cash in hand - there is no
                // platform-held money to credit at all. What actually
                // happened here is the platform earning its commission on
                // a sale it never touched, so instead of crediting
                // `balance` with the net amount, this debits just the
                // commission out of it. A seller with too little balance
                // to cover it goes negative (explicitly allowed - see
                // requestWithdrawal's `amount > wallet.balance` check,
                // which already blocks withdrawing while negative) and the
                // deficit is repaid automatically out of future earnings,
                // since every later incrementBalance call just adds to
                // whatever balance currently is.
                const balanceAfter = await walletRepository.incrementBalance(sellerId, -totals.commissionTotal, connection);

                await walletRepository.insertTransaction({
                    sellerId,
                    type: "debit",
                    amount: totals.commissionTotal,
                    balanceAfter,
                    referenceType: "cod_commission",
                    referenceId: orderId,
                    description: `Cash on Delivery order #${orderId} - platform commission (${sellerCommissionRate}%) debited (cash already collected by your delivery agent)`
                }, connection);
            } else if (isEscrowed) {
                const heldAfter = await walletRepository.incrementHeldBalance(sellerId, totals.netTotal, connection);

                await walletRepository.insertTransaction({
                    sellerId,
                    type: "credit",
                    amount: totals.netTotal,
                    balanceAfter: heldAfter,
                    referenceType: "order",
                    referenceId: orderId,
                    description: `Sale earnings for order #${orderId} held pending release (${sellerCommissionRate}% platform commission deducted)`
                }, connection);
            } else {
                const balanceAfter = await walletRepository.incrementBalance(sellerId, totals.netTotal, connection);

                await walletRepository.insertTransaction({
                    sellerId,
                    type: "credit",
                    amount: totals.netTotal,
                    balanceAfter,
                    referenceType: "order",
                    referenceId: orderId,
                    description: `Sale earnings for order #${orderId} (${sellerCommissionRate}% platform commission deducted)`
                }, connection);
            }
        }

        await connection.commit();

        for (const sellerId of bySeller.keys()) {
            notificationService.notify({
                userId: sellerId,
                type: "wallet_credit",
                titleKey: isCod ? "notifications.wallet.codCommissionDebited.title" : "notifications.wallet.credited.title",
                messageKey: isCod ? "notifications.wallet.codCommissionDebited.message" : "notifications.wallet.credited.message",
                messageParams: { orderId },
                relatedOrderId: orderId,
                withEmail: false
            }).catch((err) => logger.warn({ err, orderId }, "wallet credit notify error"));
        }

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

// ---- Bookings (Financial Integration) ----------------------------
// Called once a booking's payment is confirmed (payment.service.js's
// booking-payment webhook handler). Mirrors creditSellersForOrder above
// almost exactly - the one real difference is that a booking never splits
// across multiple providers the way a multi-vendor order splits across
// sellers (bookings.provider_id is a single snapshot of services.provider_id
// - see 063's design notes), so there's no bySeller grouping map here, just
// one provider credited from every uncredited booking_items row.
//
// Escrow: every booking payment goes through a platform-captured gateway
// (mobile money / Snippe / PayPal) - there's no Cash-on-Delivery-shaped
// concept for a service, so unlike creditSellersForOrder there's no
// isEscrowed branch here at all; a provider's earnings always land in
// held_balance and wait for releaseEligibleBookingEarnings below.
exports.creditProvidersForBooking = async (bookingId) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const items = await walletRepository.findUncreditedItemsByBooking(bookingId, connection);

        if (items.length === 0) {
            await connection.commit();
            return;
        }

        const subscriptionService = require("../subscription/subscription.service");
        const providerId = items[0].provider_id;
        const commissionRate = await subscriptionService.getEffectiveCommissionRate(providerId);
        let netTotal = 0;

        for (const item of items) {
            const subtotal = Number(item.subtotal);
            const commissionAmount = Number((subtotal * (commissionRate / 100)).toFixed(2));
            const netAmount = Number((subtotal - commissionAmount).toFixed(2));

            await walletRepository.markBookingItemCredited(
                item.id, commissionRate, commissionAmount, netAmount, false, connection
            );

            netTotal = Number((netTotal + netAmount).toFixed(2));
        }

        await walletRepository.ensureWallet(providerId, connection);
        await walletRepository.getWalletForUpdate(providerId, connection);

        const heldAfter = await walletRepository.incrementHeldBalance(providerId, netTotal, connection);

        await walletRepository.insertTransaction({
            sellerId: providerId,
            type: "credit",
            amount: netTotal,
            balanceAfter: heldAfter,
            referenceType: "booking",
            referenceId: bookingId,
            description: `Booking earnings for booking #${bookingId} held pending release (${commissionRate}% platform commission deducted)`
        }, connection);

        await connection.commit();

        notificationService.notify({
            userId: providerId,
            type: "wallet_credit",
            titleKey: "notifications.wallet.credited.title",
            messageKey: "notifications.wallet.credited.message",
            messageParams: { orderId: bookingId },
            withEmail: false
        }).catch((err) => logger.warn({ err, bookingId }, "provider wallet credit notify error"));

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

// Shared release mechanics for one already-fetched set of booking_items
// rows - used by both the scheduled release job (platform-wide scan) and
// the admin manual early-release action (one booking's items). No
// dispute-freeze branch here (unlike releaseItems for orders above) since
// there's no dispute system for bookings yet - see migration 064's design
// notes - so every eligible item is a plain release.
const releaseBookingItems = async (items) => {
    const summary = { released: 0, amountReleased: 0, errored: 0 };
    if (items.length === 0) {
        return summary;
    }

    const releasedProviderIds = new Set();

    for (const item of items) {
        // Same per-item isolation as releaseItems above (Phase 2, P0) - one
        // bad booking_items row is logged and skipped, not fatal to the
        // whole sweep.
        try {
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();

                await walletRepository.ensureWallet(item.provider_id, connection);
                await walletRepository.getWalletForUpdate(item.provider_id, connection);

                const netAmount = Number(item.provider_net_amount);
                await walletRepository.incrementHeldBalance(item.provider_id, -netAmount, connection);
                const balanceAfter = await walletRepository.incrementBalance(item.provider_id, netAmount, connection);
                await walletRepository.markBookingItemReleased(item.id, connection);

                await walletRepository.insertTransaction({
                    sellerId: item.provider_id,
                    type: "credit",
                    amount: netAmount,
                    balanceAfter,
                    referenceType: "escrow_release",
                    referenceId: item.booking_id,
                    description: `Held earnings released for booking #${item.booking_id}`
                }, connection);

                await connection.commit();

                summary.released += 1;
                summary.amountReleased = Number((summary.amountReleased + netAmount).toFixed(2));
                releasedProviderIds.add(item.provider_id);

            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        } catch (error) {
            summary.errored += 1;
            logger.error({ err: error, bookingItemId: item.id, bookingId: item.booking_id }, "booking escrow release error for one item - skipped, will retry next sweep");
            Sentry.captureException(error, { tags: { area: "wallet", stage: "booking-escrow-release" }, extra: { bookingItemId: item.id, bookingId: item.booking_id } });
        }
    }

    for (const providerId of releasedProviderIds) {
        notificationService.notify({
            userId: providerId,
            type: "wallet_release",
            titleKey: "notifications.wallet.released.title",
            messageKey: "notifications.wallet.released.message",
            withEmail: false
        }).catch((err) => logger.warn({ err, providerId }, "provider wallet release notify error"));
    }

    return summary;
};

// Called by jobs/escrowRelease.job.js alongside releaseEligibleEarnings -
// scans every held, credited, unreleased booking_items row whose booking
// is completed and past settings.escrow_hold_days (the same admin-tunable
// window orders use - see migration 064's design notes on reusing it
// as-is), and releases it.
exports.releaseEligibleBookingEarnings = async () => {
    const holdDays = await settingsService.getEscrowHoldDays();
    const items = await walletRepository.findReleasableBookingItems(holdDays);
    return releaseBookingItems(items);
};

// Admin manual early release for one booking - the booking equivalent of
// releaseOrderEarnings below. Bypasses the completed/hold-days timing gate.
exports.releaseBookingEarnings = async (bookingId) => {
    const items = await walletRepository.findReleasableBookingItemsForBooking(bookingId);
    if (items.length === 0) {
        throw new Error("No held earnings are eligible for release on this booking");
    }
    return releaseBookingItems(items);
};

// Called from booking.service.js#cancelBooking when a paid booking is
// cancelled - the booking equivalent of dispute.service.js's
// reverseSellerEarnings (module-private there; exported here since a
// booking cancellation has no dispute row to hang the reversal off of).
// Reverses held_balance first, then balance if the held amount alone
// isn't enough (mirrors that same held-then-balance order exactly, for
// the same reason: a booking's earnings may have already been released
// into balance by the time a late cancellation happens).
exports.reverseProviderEarningsForBooking = async (providerId, amount, bookingId) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await walletRepository.ensureWallet(providerId, connection);
        const wallet = await walletRepository.getWalletForUpdate(providerId, connection);

        const heldReversal = Math.min(amount, Math.max(Number(wallet.held_balance), 0));
        const balanceReversal = Number((amount - heldReversal).toFixed(2));

        if (heldReversal > 0) {
            const heldAfter = await walletRepository.incrementHeldBalance(providerId, -heldReversal, connection);

            await walletRepository.insertTransaction({
                sellerId: providerId,
                type: "debit",
                amount: heldReversal,
                balanceAfter: heldAfter,
                referenceType: "booking",
                referenceId: bookingId,
                description: `Refund issued for booking #${bookingId} - held earnings reversed`
            }, connection);
        }

        if (balanceReversal > 0) {
            const balanceAfter = await walletRepository.incrementBalance(providerId, -balanceReversal, connection);

            await walletRepository.insertTransaction({
                sellerId: providerId,
                type: "debit",
                amount: balanceReversal,
                balanceAfter,
                referenceType: "booking",
                referenceId: bookingId,
                description: `Refund issued for booking #${bookingId} - earnings reversed`
            }, connection);
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

// Cancel a paid order (Phase 3, P0) - reverses whatever each seller was
// actually already credited for this order's items (net of commission;
// see creditSellersForOrder), grouped per seller so a multi-vendor split
// order reverses each vendor's own slice independently. Mirrors
// dispute.service.js#reverseSellerEarnings' held-then-balance strategy
// exactly (reverse from held_balance first, spill any remainder into
// balance - see that function's comment for why this is correct
// order-agnostic behavior), generalized here since cancelOrder needs the
// same shape across potentially several sellers in one call, not just one.
// A no-op if nothing was ever credited (order cancelled before payment
// confirmation reached creditSellersForOrder, or it raced and lost -
// nothing to reverse either way).
exports.reverseSellerEarningsForOrder = async (orderId) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const items = await walletRepository.findCreditedItemsForOrderTree(orderId, connection);

        if (items.length === 0) {
            await connection.commit();
            return { reversed: [] };
        }

        const bySeller = new Map();
        for (const item of items) {
            const amount = Number(item.seller_net_amount || 0);
            bySeller.set(item.seller_id, Number(((bySeller.get(item.seller_id) || 0) + amount).toFixed(2)));
        }

        const reversed = [];
        for (const [sellerId, amount] of bySeller.entries()) {
            if (amount <= 0) continue;

            await walletRepository.ensureWallet(sellerId, connection);
            const wallet = await walletRepository.getWalletForUpdate(sellerId, connection);

            const heldReversal = Math.min(amount, Math.max(Number(wallet.held_balance), 0));
            const balanceReversal = Number((amount - heldReversal).toFixed(2));

            if (heldReversal > 0) {
                const heldAfter = await walletRepository.incrementHeldBalance(sellerId, -heldReversal, connection);
                await walletRepository.insertTransaction({
                    sellerId,
                    type: "debit",
                    amount: heldReversal,
                    balanceAfter: heldAfter,
                    referenceType: "order_cancellation",
                    referenceId: orderId,
                    description: `Order #${orderId} cancelled - held earnings reversed`
                }, connection);
            }

            if (balanceReversal > 0) {
                const balanceAfter = await walletRepository.incrementBalance(sellerId, -balanceReversal, connection);
                await walletRepository.insertTransaction({
                    sellerId,
                    type: "debit",
                    amount: balanceReversal,
                    balanceAfter,
                    referenceType: "order_cancellation",
                    referenceId: orderId,
                    description: `Order #${orderId} cancelled - earnings reversed`
                }, connection);
            }

            reversed.push({ sellerId, amount });
        }

        await walletRepository.markItemsReleased(items.map((item) => item.id), connection);

        await connection.commit();
        return { reversed };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

exports.getWalletSummary = async (sellerId) => {
    await walletRepository.ensureWallet(sellerId);
    const wallet = await walletRepository.getWallet(sellerId);
    const transactions = await walletRepository.findTransactions(sellerId, 50);

    return {
        balance: Number(wallet.balance),
        heldBalance: Number(wallet.held_balance),
        transactions
    };
};

// ---- Escrow release  ---------------------------------------------

const OPEN_DISPUTE_STATUSES = ["open", "under_review"];
const REFUND_RESOLUTIONS = ["refund_full", "refund_partial"];

// Shared by the release job (scans every eligible item platform-wide)
// and the admin manual early-release action (one order's items) - see
// docs/ESCROW_ANALYSIS.md section 3.4. Items are grouped by order so
// each order's disputes are fetched once, then the same rule is applied
// to every item, closing the precision gap flagged in the Phase 9C
// README (an item's held earnings may have already been reversed by a
// dispute refund, which is pooled against the seller's wallet rather
// than tied to a specific order_item):
//
//  - an open/under_review dispute against the item, or against the whole
//    order (order_item_id is null for a whole-order dispute), freezes
//    it - skip, it's picked up again on a later run once the dispute
//    closes.
//  - a dispute already resolved with a refund has already reversed this
//    item's earnings out of held_balance via
//    dispute.service.js#reverseSellerEarnings - there's nothing left to
//    release, so just close the item out (wallet_released = TRUE) with
//    no wallet movement, so the release job stops rescanning it.
//  - anything else (no dispute at all, or one resolved without a
//    refund - rejected, or resolved with replacement/compensation/
//    no_action) is a normal release: move the item's net amount from
//    held_balance to balance and mark it released.
const releaseItems = async (items) => {
    const summary = { released: 0, closedByDispute: 0, frozen: 0, amountReleased: 0, errored: 0 };
    if (items.length === 0) {
        return summary;
    }

    const disputesByOrder = new Map();
    const getOrderDisputes = async (orderId) => {
        if (!disputesByOrder.has(orderId)) {
            disputesByOrder.set(orderId, await disputeRepository.findByOrderId(orderId));
        }
        return disputesByOrder.get(orderId);
    };

    const releasedSellerIds = new Set();

    for (const item of items) {
        // Escrow release, per item (Phase 2, P0). One bad row (a stale
        // dispute lookup, a transient DB error) must never block every
        // other item in the sweep from releasing - caught, logged to
        // Sentry, and the sweep moves on; this item is simply picked up
        // again on the next run since it's still wallet_released = FALSE.
        try {
            const disputes = await getOrderDisputes(item.order_id);
            const relevant = disputes.filter(
                (d) => d.order_item_id === item.id || d.order_item_id === null
            );

            if (relevant.some((d) => OPEN_DISPUTE_STATUSES.includes(d.status))) {
                summary.frozen += 1;
                continue;
            }

            const closedByRefund = relevant.some(
                (d) => d.status === "resolved" && REFUND_RESOLUTIONS.includes(d.resolution)
            );

            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();

                if (closedByRefund) {
                    await walletRepository.markItemReleased(item.id, connection);
                    await connection.commit();
                    summary.closedByDispute += 1;
                    continue;
                }

                await walletRepository.ensureWallet(item.seller_id, connection);
                await walletRepository.getWalletForUpdate(item.seller_id, connection);

                const netAmount = Number(item.seller_net_amount);
                await walletRepository.incrementHeldBalance(item.seller_id, -netAmount, connection);
                const balanceAfter = await walletRepository.incrementBalance(item.seller_id, netAmount, connection);
                await walletRepository.markItemReleased(item.id, connection);

                await walletRepository.insertTransaction({
                    sellerId: item.seller_id,
                    type: "credit",
                    amount: netAmount,
                    balanceAfter,
                    referenceType: "escrow_release",
                    referenceId: item.order_id,
                    description: `Held earnings released for order #${item.order_id}`
                }, connection);

                await connection.commit();

                summary.released += 1;
                summary.amountReleased = Number((summary.amountReleased + netAmount).toFixed(2));
                releasedSellerIds.add(item.seller_id);

            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        } catch (error) {
            summary.errored += 1;
            logger.error({ err: error, orderItemId: item.id, orderId: item.order_id }, "escrow release error for one item - skipped, will retry next sweep");
            Sentry.captureException(error, { tags: { area: "wallet", stage: "escrow-release" }, extra: { orderItemId: item.id, orderId: item.order_id } });
        }
    }

    for (const sellerId of releasedSellerIds) {
        notificationService.notify({
            userId: sellerId,
            type: "wallet_release",
            titleKey: "notifications.wallet.released.title",
            messageKey: "notifications.wallet.released.message",
            withEmail: false
        }).catch((err) => logger.warn({ err, sellerId }, "wallet release notify error"));
    }

    return summary;
};

// Called by jobs/escrowRelease.job.js. Scans every held, credited,
// unreleased item whose order is delivered and past
// settings.escrow_hold_days, and releases whatever the dispute rule
// above allows.
exports.releaseEligibleEarnings = async () => {
    const [holdDays, returnWindowDays, returnWindowInsuredDays] = await Promise.all([
        settingsService.getEscrowHoldDays(),
        settingsService.getReturnWindowDays(),
        settingsService.getReturnWindowInsuredDays()
    ]);
    const items = await walletRepository.findReleasableItems(holdDays, returnWindowDays, returnWindowInsuredDays);
    return releaseItems(items);
};

// Admin manual early release for one order (docs/ESCROW_ANALYSIS.md
// section 3.4 - e.g. a buyer has confirmed receipt, or an admin wants to
// close out a stale/edge-case order). Bypasses the delivered/hold-days
// timing gate entirely, but still respects the dispute-freeze rule above
// - an admin can't use this to release funds out from under an open
// dispute.
exports.releaseOrderEarnings = async (orderId) => {
    const items = await walletRepository.findReleasableItemsForOrder(orderId);
    if (items.length === 0) {
        throw new Error("No held earnings are eligible for release on this order");
    }
    return releaseItems(items);
};

// Multi-currency payouts. payoutCurrency defaults to "TZS"
// (existing behavior, unchanged) - a seller can instead request "USD",
// in which case the withdrawal is still debited from the wallet in TZS
// (the wallet itself stays TZS-denominated - order/booking commission
// math elsewhere is untouched) but the *payout* amount is converted
// Payout detail validation (Phase 2, P1). payout_method/payout_details are
// still free-text fields (not yet split into structured network+phone /
// bank+account+name columns - see the "Flagged, not changed" note this
// phase ships with), so this is a best-effort heuristic on top of them
// rather than real structured validation: classify the method by keyword,
// then check the details string plausibly contains what that method needs.
// A real fix means giving withdrawal_requests separate structured columns
// and updating the request-withdrawal form to collect them - out of scope
// for this phase's wallet/escrow/COD focus.
const MOBILE_MONEY_KEYWORDS = ["mpesa", "m-pesa", "tigo", "airtel", "halopesa", "halotel", "mobile"];
const BANK_KEYWORDS = ["bank", "crdb", "nmb", "nbc", "exim", "stanbic", "absa", "equity"];

const validatePayoutDetails = (payoutMethod, payoutDetails) => {
    const method = String(payoutMethod || "").toLowerCase();
    const details = String(payoutDetails || "");
    const digitRun = (details.match(/\d+/g) || []).join("");

    if (MOBILE_MONEY_KEYWORDS.some((kw) => method.includes(kw))) {
        if (digitRun.length < 9) {
            throw new Error("Please include the mobile money network and a valid phone number in your payout details");
        }
        return;
    }

    if (BANK_KEYWORDS.some((kw) => method.includes(kw))) {
        const hasLetters = /[a-zA-Z]/.test(details);
        if (!hasLetters || digitRun.length < 6) {
            throw new Error("Please include the bank name, account number and account holder name in your payout details");
        }
    }
};

// requestWithdrawal (Phase 2 additions):
//  - min/max amount, from platform settings.
//  - a daily cap that scales with the seller's users.verification_tier.
//  - per-method payout detail validation (see validatePayoutDetails above).
//  - a 24-hour hold, enforced at approval time, on the FIRST withdrawal
//    ever requested to a given payout method+details combination - see
//    wallet.repository.js#hasPriorPayoutUsage.
//
// using the same admin-editable usd_exchange_rate setting
// paypal.provider.js already uses, and both the converted amount and
// the rate actually used are snapshotted onto the withdrawal row so a
// later admin change to the rate never rewrites what this seller was
// quoted.
exports.requestWithdrawal = async (sellerId, amount, payoutMethod, payoutDetails, payoutCurrency = "TZS") => {
    validatePayoutDetails(payoutMethod, payoutDetails);

    const limits = await settingsService.getWithdrawalLimits();
    if (Number(amount) < limits.minAmount) {
        throw new Error(`The minimum withdrawal amount is ${limits.minAmount}`);
    }
    if (Number(amount) > limits.maxAmount) {
        throw new Error(`The maximum withdrawal amount is ${limits.maxAmount}`);
    }

    const openDisputes = await disputeRepository.countOpenBySeller(sellerId);
    if (openDisputes >= limits.openDisputeBlockThreshold) {
        throw new Error(`You have ${openDisputes} open dispute(s) - please resolve them before requesting a withdrawal`);
    }

    const verificationTier = await walletRepository.getSellerVerificationTier(sellerId);
    const dailyCap = limits.dailyCapByTier[verificationTier] ?? limits.dailyCapByTier.none;
    const requestedToday = await walletRepository.sumWithdrawalsRequestedToday(sellerId);
    if (requestedToday + Number(amount) > dailyCap) {
        throw new Error(`This would take today's withdrawals over your account's daily limit of ${dailyCap}. Verify your identity to raise your limit.`);
    }

    const isNewPayoutDetails = !(await walletRepository.hasPriorPayoutUsage(sellerId, payoutMethod, payoutDetails));
    const holdUntil = isNewPayoutDetails
        ? new Date(Date.now() + limits.newPayoutHoldHours * 60 * 60 * 1000)
        : null;

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await walletRepository.ensureWallet(sellerId, connection);
        const wallet = await walletRepository.getWalletForUpdate(sellerId, connection);

        if (Number(amount) <= 0) {
            throw new Error("Withdrawal amount must be greater than zero");
        }

        if (Number(amount) > Number(wallet.balance)) {
            throw new Error("Withdrawal amount exceeds your wallet balance");
        }

        let payoutAmount = null;
        let payoutExchangeRate = null;
        if (payoutCurrency === "USD") {
            payoutExchangeRate = await settingsService.getUsdExchangeRate();
            payoutAmount = Number((Number(amount) / payoutExchangeRate).toFixed(2));
        }

        const balanceAfter = await walletRepository.incrementBalance(sellerId, -Number(amount), connection);

        const withdrawalId = await walletRepository.createWithdrawal(
            sellerId, amount, payoutMethod, payoutDetails, connection, payoutCurrency, payoutAmount, payoutExchangeRate,
            holdUntil, isNewPayoutDetails
        );

        await walletRepository.insertTransaction({
            sellerId,
            type: "debit",
            amount,
            balanceAfter,
            referenceType: "withdrawal",
            referenceId: withdrawalId,
            description: payoutCurrency === "USD"
                ? `Withdrawal request #${withdrawalId} (${payoutMethod}, paid out as ~$${payoutAmount} USD)`
                : `Withdrawal request #${withdrawalId} (${payoutMethod})`
        }, connection);

        await connection.commit();

        // Fire-and-forget, after commit - fraud flagging is advisory and
        // must never delay or block a legitimate withdrawal.
        fraudService.evaluateWithdrawal(sellerId, amount)
            .catch((err) => {
                logger.error({ err, sellerId }, "fraud withdrawal evaluation failed");
                Sentry.captureException(err, { tags: { area: "wallet", stage: "fraud-evaluation" }, extra: { sellerId } });
            });

        return { withdrawalId, balance: balanceAfter, isNewPayoutDetails, holdUntil };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

exports.getMyWithdrawals = async (sellerId) => {
    return walletRepository.findWithdrawalsBySeller(sellerId);
};

// ---- Admin ------------------------------------------------------------------

// payout_details is masked here; the full value comes from
// getWithdrawalPayoutDetails, which writes an audit entry.
exports.listAllWithdrawals = async () => {
    const rows = await walletRepository.findAllWithdrawals();
    return rows.map((row) => ({
        ...row,
        payout_details: maskPayoutDetails(row.payout_details),
        payout_details_masked: true
    }));
};

exports.getWithdrawalPayoutDetails = async (withdrawalId, { adminId, req } = {}) => {
    const rows = await walletRepository.findAllWithdrawals();
    const withdrawal = rows.find((row) => Number(row.id) === Number(withdrawalId));
    if (!withdrawal) {
        const error = new Error("Withdrawal not found.");
        error.status = 404;
        throw error;
    }

    // Awaited: no audit entry, no reveal.
    await auditRepository.insertLog({
        userId: adminId,
        eventType: "payout_details_revealed",
        description: `Admin revealed payout details of withdrawal #${withdrawal.id} (seller #${withdrawal.seller_id})`,
        ipAddress: req?.ip || null,
        metadata: { withdrawal_id: withdrawal.id, seller_id: withdrawal.seller_id }
    });

    return {
        payout_method: withdrawal.payout_method,
        payout_details: withdrawal.payout_details
    };
};

exports.listNegativeBalanceSellers = async () => {
    return walletRepository.findNegativeBalanceSellers();
};

// Approving/rejecting/marking-paid doesn't move money by itself - the debit
// already happened when the request was created (see requestWithdrawal), so
// a rejection has to refund the seller's wallet.
//
// Phase 2 additions: "approve" is blocked while the request is still
// inside its first-time-payout-details hold window; "paid" now requires a
// payout reference/receipt from the admin, recorded on the row.
exports.processWithdrawal = async (withdrawalId, action, adminNote, payoutReference = null) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const withdrawal = await walletRepository.findWithdrawalById(withdrawalId, connection);

        if (!withdrawal) {
            throw new Error("Withdrawal request not found");
        }

        const nextStatus = { approve: "approved", reject: "rejected", paid: "paid" }[action];
        if (!nextStatus) {
            throw new Error("Invalid action");
        }

        // approve/reject only make sense from "pending"; "paid" must come
        // from "approved" - a request can no longer skip straight from
        // pending to paid without going through approval first.
        const validFromStatus = action === "paid" ? "approved" : "pending";
        if (withdrawal.status !== validFromStatus) {
            throw new Error(`This request is already "${withdrawal.status}"`);
        }

        if (action === "approve" && withdrawal.hold_until && new Date(withdrawal.hold_until) > new Date()) {
            throw new Error(`This is the seller's first withdrawal to these payout details - it can't be approved until ${new Date(withdrawal.hold_until).toISOString()}`);
        }

        if (action === "paid" && !payoutReference) {
            throw new Error("A payout reference/receipt is required to mark a withdrawal as paid");
        }

        if (action === "reject") {
            // Refund the seller's wallet since the amount was deducted upfront.
            const balanceAfter = await walletRepository.incrementBalance(
                withdrawal.seller_id, Number(withdrawal.amount), connection
            );

            await walletRepository.insertTransaction({
                sellerId: withdrawal.seller_id,
                type: "credit",
                amount: withdrawal.amount,
                balanceAfter,
                referenceType: "withdrawal",
                referenceId: withdrawal.id,
                description: `Withdrawal request #${withdrawal.id} rejected - amount refunded`
            }, connection);
        }

        await walletRepository.updateWithdrawalStatus(withdrawalId, nextStatus, adminNote, connection, action === "paid" ? payoutReference : null);

        await connection.commit();

        notificationService.notify({
            userId: withdrawal.seller_id,
            type: "withdrawal_status",
            titleKey: "notifications.withdrawal.status.title",
            titleParams: { status: nextStatus },
            messageKey: action === "reject" ? "notifications.withdrawal.rejected.message" : "notifications.withdrawal.status.message",
            messageParams: {
                amount: withdrawal.amount,
                status: nextStatus,
                note: adminNote ? { key: "notifications.withdrawal.note", params: { note: adminNote } } : ""
            },
            withEmail: true
        }).catch((err) => logger.warn({ err, withdrawalId: withdrawal.id }, "withdrawal notify error"));

        return { status: nextStatus };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

// ---- Nightly wallet reconciliation (Phase 2) ------------------------------
// Recomputes every seller AND buyer wallet's balance from its own ledger
// and records a row in wallet_reconciliation_flags for any mismatch -
// admins get a visible, dated list instead of drift going unnoticed until
// a seller/buyer complains. Never touches the wallet itself: the
// recorded balance is left exactly as-is, since deciding which side is
// "right" (a bug vs. a legitimate direct adjustment) needs a human.
exports.reconcileWallets = async () => {
    const buyerWalletRepository = require("../buyerWallet/buyerWallet.repository");

    const [sellerDrift, buyerDrift] = await Promise.all([
        walletRepository.findBalanceDrift(),
        buyerWalletRepository.findBalanceDrift()
    ]);

    for (const row of sellerDrift) {
        await walletRepository.insertReconciliationFlag({
            walletType: "seller",
            ownerId: row.owner_id,
            recordedBalance: Number(row.recorded_balance),
            computedBalance: Number(row.computed_balance)
        });
    }
    for (const row of buyerDrift) {
        await walletRepository.insertReconciliationFlag({
            walletType: "buyer",
            ownerId: row.owner_id,
            recordedBalance: Number(row.recorded_balance),
            computedBalance: Number(row.computed_balance)
        });
    }

    if (sellerDrift.length > 0 || buyerDrift.length > 0) {
        logger.warn({ sellerDriftCount: sellerDrift.length, buyerDriftCount: buyerDrift.length }, "wallet reconciliation found drift");
    }

    return { sellerDriftCount: sellerDrift.length, buyerDriftCount: buyerDrift.length };
};

// Phase 8: paged admin queue. Payout details are masked exactly as in
// listAllWithdrawals; the full value still only comes from
// getWithdrawalPayoutDetails (audited).
const WITHDRAWAL_STATUSES = ["pending", "approved", "rejected", "paid"];

exports.listAllWithdrawalsPaged = async (query = {}) => {
    const { parseListQuery, buildMeta } = require("../../utils/adminListQuery");
    const params = parseListQuery(query);
    const status = WITHDRAWAL_STATUSES.includes(params.status) ? params.status : null;

    const [{ rows, total }, totals] = await Promise.all([
        walletRepository.findWithdrawalsPage({ q: params.q, status, sort: query.sort, limit: params.pageSize, offset: params.offset }),
        walletRepository.findWithdrawalTotalsByStatus()
    ]);

    return {
        items: rows.map((row) => ({
            ...row,
            payout_details: maskPayoutDetails(row.payout_details),
            payout_details_masked: true
        })),
        meta: { ...buildMeta(total, params), totals }
    };
};
