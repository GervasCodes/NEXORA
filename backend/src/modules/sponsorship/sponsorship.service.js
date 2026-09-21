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

// Ends a still-running campaign early. Deliberately no pro-rated refund -
// see README-phase-8A.md's "Not in scope" section for why that's a later
// decision rather than bundled in here. Only clears is_sponsored if no
// second, independent campaign is still actively running for the same
// product (a seller - or admin - could in principle have more than one
// active reason for the flag to be on).
exports.cancelCampaign = async (sellerId, campaignId) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const campaign = await sponsorshipRepository.findByIdForUpdate(campaignId, connection);

        if (!campaign || campaign.seller_id !== sellerId) {
            throw new Error("Campaign not found");
        }
        if (campaign.status !== "active") {
            throw new Error(`This campaign is already "${campaign.status}"`);
        }

        await sponsorshipRepository.updateStatus(campaignId, "cancelled", connection);

        const stillSponsored = await sponsorshipRepository.hasOtherActiveCampaign(
            campaign.product_id, campaign.id, connection
        );
        if (!stillSponsored) {
            await productRepository.setSponsored(campaign.product_id, false, connection);
        }

        await connection.commit();
        return { status: "cancelled" };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

// --- Cron job entry point (jobs/sponsorshipExpiry.job.js) ---------------
//
// Closes out every campaign whose ends_at has passed. Idempotent: only
// ever touches rows still marked 'active', so it's safe to run on every
// tick even if the previous run already handled everything.
exports.expireDueCampaigns = async () => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const due = await sponsorshipRepository.findExpiredActive(connection);

        for (const campaign of due) {
            await sponsorshipRepository.updateStatus(campaign.id, "expired", connection);

            const stillSponsored = await sponsorshipRepository.hasOtherActiveCampaign(
                campaign.product_id, campaign.id, connection
            );
            if (!stillSponsored) {
                await productRepository.setSponsored(campaign.product_id, false, connection);
            }
        }

        await connection.commit();

        for (const campaign of due) {
            notificationService.notify({
                userId: campaign.seller_id,
                type: "sponsorship_expired",
                titleKey: "notifications.sponsorship.expired.title",
                messageKey: "notifications.sponsorship.expired.message",
                messageParams: { productName: campaign.product_name },
                withEmail: false
            }).catch((err) => logger.warn({ err }, "sponsorship expiry notify error"));
        }

        return due.length;

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

// --- Admin oversight (read-only - the manual sponsor/unsponsor toggle in
// admin.service.js#setProductSponsored remains the separate, free lever
// for admin curation; this just lets an admin see what sellers are
// paying to sponsor) -------------------------------------------------------
exports.listAllCampaigns = async () => {
    return sponsorshipRepository.findAll();
};
