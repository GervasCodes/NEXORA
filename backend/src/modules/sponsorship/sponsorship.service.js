const db = require("../../config/db");
const sponsorshipRepository = require("./sponsorship.repository");
const logger = require("../../utils/logger").child({ module: "sponsorship" });
const productRepository = require("../product/product.repository");
const walletRepository = require("../wallet/wallet.repository");
const settingsService = require("../settings/settings.service");
const notificationService = require("../notification/notification.service");
const sponsorshipCreditService = require("../sponsorshipCredit/sponsorshipCredit.service");

// A seller can sponsor a product for at least a day, at most a month at
// a time - long enough to be useful, short enough that a mistaken
// purchase (wrong product, fat-fingered duration) can't lock up a large
// chunk of their wallet for very long. Nothing stops them creating a new
// campaign the moment one ends.
const MIN_DAYS = 1;
const MAX_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// What a seller sees before committing to a campaign - the form on
// SellerSponsorship.jsx reads this to show "X/day" and compute a live
// total as they change the duration slider, rather than only finding out
// the cost on submit.
exports.getPricing = async (sellerId) => {
    const dailyRate = await settingsService.getSponsorshipDailyRate();
    const creditContext = await sponsorshipCreditService.getPricingContext(sellerId);
    return { daily_rate: dailyRate, min_days: MIN_DAYS, max_days: MAX_DAYS, ...creditContext };
};

// Charges the seller's wallet, snapshots the rate that applied, opens
// the campaign, and flips products.is_sponsored on - all inside one
// transaction, same shape wallet.service.js#requestWithdrawal already
// uses for "row-lock wallet, check funds, debit, write ledger entry".
exports.createCampaign = async (sellerId, productId, days) => {
    const parsedDays = Number(days);
    if (!Number.isInteger(parsedDays) || parsedDays < MIN_DAYS || parsedDays > MAX_DAYS) {
        throw new Error(`Choose a duration between ${MIN_DAYS} and ${MAX_DAYS} days`);
    }

    const product = await productRepository.findById(productId);
    if (!product || product.seller_id !== sellerId) {
        throw new Error("Product not found");
    }
    if (!product.is_active) {
        throw new Error("Only an active, published product can be sponsored");
    }

    const dailyRate = await settingsService.getSponsorshipDailyRate();
    // Monetization Master Switch: monetization_sponsorship_enabled now
    // means "may this seller buy sponsorship a la carte at all". Included
    // subscription credits are already paid for, so they keep working
    // when it's off - it only blocks the paid remainder.
    const paidEnabled = await settingsService.isSponsorshipMonetizationEnabled();

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await walletRepository.ensureWallet(sellerId, connection);
        const wallet = await walletRepository.getWalletForUpdate(sellerId, connection);

        // Funding: included credits first (1 credit = 1 campaign-day),
        // then the paid a la carte flow for whatever days they don't
        // cover, at this campaign type's daily rate. Credits are only
        // planned here - nothing is consumed until the wallet check below
        // passes, so a campaign that can't be paid for never touches the
        // seller's allotment. Lock order (wallet, then credit period) is
        // the same in all three campaign services.
        const funding = await sponsorshipCreditService.planFunding(
            sellerId, { days: parsedDays, dailyRate, paidEnabled }, connection
        );
        const { creditDays, paidDays, totalCost } = funding;

        if (totalCost > Number(wallet.balance)) {
            throw new Error(
                "Insufficient wallet balance to fund this campaign. Top up from your order earnings, or choose a shorter duration."
            );
        }

        const endsAt = new Date(Date.now() + parsedDays * MS_PER_DAY);

        const campaignId = await sponsorshipRepository.create(
            { sellerId, productId, dailyRate, days: parsedDays, totalCost, creditsUsed: creditDays, endsAt },
            connection
        );

        await sponsorshipCreditService.consumeCredits(funding.periodId, creditDays, connection);

        let balanceAfter = Number(wallet.balance);
        if (totalCost > 0) {
            balanceAfter = await walletRepository.incrementBalance(sellerId, -totalCost, connection);

            await walletRepository.insertTransaction({
                sellerId,
                type: "debit",
                amount: totalCost,
                balanceAfter,
                referenceType: "sponsorship_campaign",
                referenceId: campaignId,
                description: `Sponsorship campaign #${campaignId} for "${product.name}" (${paidDays} paid day${paidDays === 1 ? "" : "s"} at ${dailyRate}/day)`
            }, connection);
        }

        await productRepository.setSponsored(productId, true, connection);

        await connection.commit();

        notificationService.notify({
            userId: sellerId,
            type: "sponsorship_started",
            titleKey: "notifications.sponsorship.started.title",
            messageKey: "notifications.sponsorship.started.message",
            messageParams: { productName: product.name, days: parsedDays, creditDays, amount: totalCost },
            withEmail: false
        }).catch((err) => logger.warn({ err }, "sponsorship start notify error"));

        return { campaignId, totalCost, creditsUsed: creditDays, balance: balanceAfter, endsAt };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

exports.getMyCampaigns = async (sellerId) => {
    return sponsorshipRepository.findBySeller(sellerId);
};

// --- Cancel with refund (Phase 6, item 1) ---------------------------------
//
// Pure. Works out what a cancel returns, from the campaign as it stands.
//
// Unused days are counted in whole days remaining (floor), so a campaign
// with 10 hours left refunds nothing for that partial day. Paid days are
// refunded first, at the rate snapshotted on the campaign; any unused days
// beyond that are returned as included credit days, up to the credits the
// campaign actually used. The sum of refunded paid days and returned credit
// days never exceeds the unused days.
exports.computeCancelRefund = ({ days, creditsUsed, dailyRate, endsAt, now }) => {
    const totalDays = Math.max(0, Number(days) || 0);
    const usedCredits = Math.max(0, Number(creditsUsed) || 0);
    const rate = Number(dailyRate) || 0;

    const remainingMs = new Date(endsAt).getTime() - new Date(now).getTime();
    const remainingDays = Math.min(totalDays, Math.max(0, Math.floor(remainingMs / MS_PER_DAY)));

    const paidDays = Math.max(0, totalDays - usedCredits);
    const refundDays = Math.min(remainingDays, paidDays);
    const refundAmount = Number((refundDays * rate).toFixed(2));
    const creditDaysToReturn = Math.min(remainingDays - refundDays, usedCredits);

    return { remainingDays, refundDays, refundAmount, creditDaysToReturn };
};

const toCancelResult = (campaign) => ({
    status: "cancelled",
    refund_amount: Number(campaign.refund_amount) || 0,
    credit_days_returned: Number(campaign.credit_days_returned) || 0,
    cancelled_at: campaign.cancelled_at
});

// Read-only. Shown to the seller on the confirm screen before they commit,
// so the amounts they see are the amounts a cancel will actually move. The
// credit days shown are only the days that will land in a current period.
exports.previewCancel = async (sellerId, campaignId) => {
    const campaign = await sponsorshipRepository.findById(campaignId);
    if (!campaign || campaign.seller_id !== sellerId) {
        throw new Error("Campaign not found");
    }
    if (campaign.status !== "active") {
        return { can_cancel: false, reason: `This campaign is already "${campaign.status}"`, ...toCancelResult(campaign) };
    }

    const plan = exports.computeCancelRefund({
        days: campaign.days,
        creditsUsed: campaign.credits_used,
        dailyRate: campaign.daily_rate,
        endsAt: campaign.ends_at,
        now: new Date()
    });
    const periodId = plan.creditDaysToReturn > 0
        ? await sponsorshipCreditService.findCurrentPeriodId(sellerId)
        : null;

    return {
        can_cancel: true,
        refund_amount: plan.refundAmount,
        refund_days: plan.refundDays,
        credit_days: periodId ? plan.creditDaysToReturn : 0,
        credit_days_lost: periodId ? 0 : plan.creditDaysToReturn,
        remaining_days: plan.remainingDays
    };
};

// Ends a still-running campaign early and refunds the unused part.
//
// One transaction. Lock order is wallet, then campaign, then credit period,
// the same order the campaign-start path uses, so the two cannot deadlock.
// Idempotent: a campaign that is already cancelled returns the result of
// the cancel that first did it, and nothing is refunded twice.
exports.cancelCampaign = async (sellerId, campaignId) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await walletRepository.ensureWallet(sellerId, connection);
        const wallet = await walletRepository.getWalletForUpdate(sellerId, connection);

        const campaign = await sponsorshipRepository.findByIdForUpdate(campaignId, connection);

        if (!campaign || campaign.seller_id !== sellerId) {
            throw new Error("Campaign not found");
        }

        if (campaign.status === "cancelled" && campaign.cancelled_at) {
            await connection.commit();
            return toCancelResult(campaign);
        }

        if (campaign.status !== "active") {
            throw new Error(`This campaign is already "${campaign.status}"`);
        }

        const plan = exports.computeCancelRefund({
            days: campaign.days,
            creditsUsed: campaign.credits_used,
            dailyRate: campaign.daily_rate,
            endsAt: campaign.ends_at,
            now: new Date()
        });

        let creditDaysReturned = 0;
        if (plan.creditDaysToReturn > 0) {
            const periodId = await sponsorshipCreditService.findCurrentPeriodIdForUpdate(sellerId, connection);
            if (periodId) {
                await sponsorshipCreditService.returnCredits(periodId, plan.creditDaysToReturn, connection);
                creditDaysReturned = plan.creditDaysToReturn;
            }
        }

        let balanceAfter = Number(wallet.balance);
        if (plan.refundAmount > 0) {
            balanceAfter = await walletRepository.incrementBalance(sellerId, plan.refundAmount, connection);
            await walletRepository.insertTransaction({
                sellerId,
                type: "credit",
                amount: plan.refundAmount,
                balanceAfter,
                referenceType: "sponsorship_campaign_refund",
                referenceId: campaignId,
                description: `Refund for cancelled sponsorship campaign #${campaignId} (${plan.refundDays} unused paid day${plan.refundDays === 1 ? "" : "s"})`
            }, connection);
        }

        const updated = await sponsorshipRepository.markCancelled(
            campaignId,
            { refundAmount: plan.refundAmount, creditDaysReturned },
            connection
        );
        if (!updated) {
            throw new Error("Campaign could not be cancelled. Please refresh and try again.");
        }

        const stillSponsored = await sponsorshipRepository.hasOtherActiveCampaign(
            campaign.product_id, campaign.id, connection
        );
        if (!stillSponsored) {
            await productRepository.setSponsored(campaign.product_id, false, connection);
        }

        await connection.commit();

        return {
            status: "cancelled",
            refund_amount: plan.refundAmount,
            credit_days_returned: creditDaysReturned,
            balance: balanceAfter
        };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

// --- Cron job entry point (jobs/sponsorshipExpiry.job.js) ---------------
//
// Phase 6, item 4. Each due campaign is processed in its own transaction,
// so one failure is logged and skipped rather than stopping the others. Each
// step is conditional on the campaign still being 'active' and past its end
// date, so a repeat run (or a cancel that landed first) changes nothing.
exports.expireDueCampaigns = async () => {
    const due = await sponsorshipRepository.findExpiredActiveIds();
    let expired = 0;

    for (const candidate of due) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const changed = await sponsorshipRepository.expireIfDue(candidate.id, connection);
            if (!changed) {
                await connection.rollback();
                continue;
            }

            const stillSponsored = await sponsorshipRepository.hasOtherActiveCampaign(
                candidate.product_id, candidate.id, connection
            );
            if (!stillSponsored) {
                await productRepository.setSponsored(candidate.product_id, false, connection);
            }

            await connection.commit();
            expired += 1;

            notificationService.notify({
                userId: candidate.seller_id,
                type: "sponsorship_expired",
                titleKey: "notifications.sponsorship.expired.title",
                messageKey: "notifications.sponsorship.expired.message",
                messageParams: { productName: candidate.product_name },
                withEmail: false
            }).catch((err) => logger.warn({ err }, "sponsorship expiry notify error"));

        } catch (error) {
            await connection.rollback().catch(() => {});
            logger.error({ err: error, campaignId: candidate.id }, "sponsorship expiry failed for campaign; continuing");
        } finally {
            connection.release();
        }
    }

    return expired;
};

// --- Admin oversight (read-only - the manual sponsor/unsponsor toggle in
// admin.service.js#setProductSponsored remains the separate, free lever
// for admin curation; this just lets an admin see what sellers are
// paying to sponsor) -------------------------------------------------------
exports.listAllCampaigns = async () => {
    return sponsorshipRepository.findAll();
};
