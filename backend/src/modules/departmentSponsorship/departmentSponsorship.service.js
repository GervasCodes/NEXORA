const db = require("../../config/db");
const departmentSponsorshipRepository = require("./departmentSponsorship.repository");
const logger = require("../../utils/logger").child({ module: "departmentSponsorship" });
const productRepository = require("../product/product.repository");
const categoryRepository = require("../category/category.repository");
const walletRepository = require("../wallet/wallet.repository");
const settingsService = require("../settings/settings.service");
const notificationService = require("../notification/notification.service");
const sponsorshipCreditService = require("../sponsorshipCredit/sponsorshipCredit.service");
const { computeCancelRefund } = require("../sponsorship/sponsorship.service");

// Same bounds as sponsorship.service.js  and
// featuredStore.service.js , for the same reason: long enough to
// be useful, short enough that a mistaken purchase can't lock up a large
// chunk of a seller's wallet for very long. Nothing stops them creating a
// new campaign the moment one ends.
const MIN_DAYS = 1;
const MAX_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The 'services' categories row (migration 065) is not a product
// department: it exists so /departments/services resolves, and Home.jsx
// renders its own dedicated Services tile while filtering this row out of
// the department grid. That grid's ordering is the only thing a department
// campaign buys (category.repository.js#findAllActiveWithSponsorship), and
// eligibility below is derived from a seller's active *products* - which a
// service provider doesn't have under this row. Selling it would charge
// the seller for a placement that never shows anywhere, so it's kept out
// of both the picker and the purchase itself (round-3 phase 6).
const SERVICES_DEPARTMENT_SLUG = "services";

// What a seller sees before committing to a campaign - the form on
// SellerDepartmentSponsorship.jsx reads this to show "X/day" and compute a
// live total as they change the duration, same shape
// sponsorship.service.js#getPricing / featuredStore.service.js#getPricing
// already use.
exports.getPricing = async (sellerId) => {
    const dailyRate = await settingsService.getDepartmentSponsorshipDailyRate();
    const creditContext = await sponsorshipCreditService.getPricingContext(sellerId);
    return { daily_rate: dailyRate, min_days: MIN_DAYS, max_days: MAX_DAYS, ...creditContext };
};

// Departments this seller can actually pay to sponsor - only ones they
// have at least one active product listed under, same eligibility rule
// featuredStore.service.js#getEligibleCategories uses (see
// product.repository.js#findActiveCategoriesBySeller).
exports.getEligibleCategories = async (sellerId) => {
    const categories = await productRepository.findActiveCategoriesBySeller(sellerId);
    return categories.filter((c) => c.slug !== SERVICES_DEPARTMENT_SLUG);
};

// Charges the seller's wallet, snapshots the rate that applied, and opens
// the campaign - all inside one transaction, same shape
// sponsorship.service.js#createCampaign (Phase 8A) and
// featuredStore.service.js#createCampaign (Phase 8B) already use for
// "row-lock wallet, check funds, debit, write ledger entry". Like Phase
// 8B and unlike Phase 8A, there is no flag on the promoted resource
// (categories) to flip: category.repository.js#findAllActiveWithSponsorship
// reads this table live, so a campaign takes effect and clears itself out
// purely by its own `status`/`ends_at` - nothing else needs to change in
// sync.
exports.createCampaign = async (sellerId, categoryId, days) => {
    const parsedDays = Number(days);
    if (!Number.isInteger(parsedDays) || parsedDays < MIN_DAYS || parsedDays > MAX_DAYS) {
        throw new Error(`Choose a duration between ${MIN_DAYS} and ${MAX_DAYS} days`);
    }

    const category = await categoryRepository.findById(categoryId);
    if (!category || !category.is_active) {
        throw new Error("Department not found");
    }

    if (category.slug === SERVICES_DEPARTMENT_SLUG) {
        throw new Error("The Services department can't be sponsored");
    }

    const eligibleCategories = await productRepository.findActiveCategoriesBySeller(sellerId);
    if (!eligibleCategories.some((c) => c.id === Number(categoryId))) {
        throw new Error("You need an active, published product in this department before you can sponsor it");
    }

    const dailyRate = await settingsService.getDepartmentSponsorshipDailyRate();
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

        // Duplicate check (Phase 6, item 2). Runs here, after the wallet
        // lock, so two requests from the same seller are serialised and
        // the second one sees the first. A campaign whose end date has
        // passed but which the sweep has not reached yet is ended first,
        // so it cannot block a fresh one.
        await departmentSponsorshipRepository.expireStaleForSellerCategory(sellerId, categoryId, connection);
        const alreadyActive = await departmentSponsorshipRepository.hasActiveForSellerCategory(
            sellerId, categoryId, connection
        );
        if (alreadyActive) {
            throw new Error("You already have an active sponsorship campaign for this department");
        }

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

        // The unique key (migration 126) is the backstop for the check
        // above; a collision means a concurrent request won the race.
        let campaignId;
        try {
            campaignId = await departmentSponsorshipRepository.create(
                { sellerId, categoryId, dailyRate, days: parsedDays, totalCost, creditsUsed: creditDays, endsAt },
                connection
            );
        } catch (err) {
            if (err && err.code === "ER_DUP_ENTRY") {
                throw new Error("You already have an active sponsorship campaign for this department");
            }
            throw err;
        }

        await sponsorshipCreditService.consumeCredits(funding.periodId, creditDays, connection);

        let balanceAfter = Number(wallet.balance);
        if (totalCost > 0) {
            balanceAfter = await walletRepository.incrementBalance(sellerId, -totalCost, connection);

            await walletRepository.insertTransaction({
                sellerId,
                type: "debit",
                amount: totalCost,
                balanceAfter,
                referenceType: "department_sponsorship_campaign",
                referenceId: campaignId,
                description: `Department sponsorship campaign #${campaignId} for "${category.name}" (${paidDays} paid day${paidDays === 1 ? "" : "s"} at ${dailyRate}/day)`
            }, connection);
        }

        await connection.commit();

        notificationService.notify({
            userId: sellerId,
            type: "department_sponsorship_started",
            titleKey: "notifications.departmentSponsorship.started.title",
            messageKey: "notifications.departmentSponsorship.started.message",
            messageParams: { categoryName: category.name, days: parsedDays, creditDays, amount: totalCost },
            withEmail: false
        }).catch((err) => logger.warn({ err }, "department sponsorship start notify error"));

        return { campaignId, totalCost, creditsUsed: creditDays, balance: balanceAfter, endsAt };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

exports.getMyCampaigns = async (sellerId) => {
    return departmentSponsorshipRepository.findBySeller(sellerId);
};

// --- Cancel with refund (Phase 6, follow-up) -------------------------------
//
// Same policy as sponsorship.service.js#cancelCampaign: unused paid days go
// back to the wallet, unused credit days go back to the current credit
// period, and a repeat cancel returns the original result. Lock order is
// wallet, then campaign, then credit period.

const toCancelResult = (campaign) => ({
    status: "cancelled",
    refund_amount: Number(campaign.refund_amount) || 0,
    credit_days_returned: Number(campaign.credit_days_returned) || 0,
    cancelled_at: campaign.cancelled_at
});

exports.previewCancel = async (sellerId, campaignId) => {
    const campaign = await departmentSponsorshipRepository.findById(campaignId);
    if (!campaign || campaign.seller_id !== sellerId) {
        throw new Error("Campaign not found");
    }
    if (campaign.status !== "active") {
        return { can_cancel: false, reason: `This campaign is already "${campaign.status}"`, ...toCancelResult(campaign) };
    }

    const plan = computeCancelRefund({
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

exports.cancelCampaign = async (sellerId, campaignId) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await walletRepository.ensureWallet(sellerId, connection);
        const wallet = await walletRepository.getWalletForUpdate(sellerId, connection);

        const campaign = await departmentSponsorshipRepository.findByIdForUpdate(campaignId, connection);

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

        const plan = computeCancelRefund({
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
                referenceType: "department_sponsorship_campaign_refund",
                referenceId: campaignId,
                description: `Refund for cancelled department sponsorship campaign #${campaignId} (${plan.refundDays} unused paid day${plan.refundDays === 1 ? "" : "s"})`
            }, connection);
        }

        const updated = await departmentSponsorshipRepository.markCancelled(
            campaignId,
            { refundAmount: plan.refundAmount, creditDaysReturned },
            connection
        );
        if (!updated) {
            throw new Error("Campaign could not be cancelled. Please refresh and try again.");
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

// --- Cron job entry point (jobs/departmentSponsorshipExpiry.job.js) -----
//
// Closes out every campaign whose ends_at has passed. Idempotent: only
// ever touches rows still marked 'active', so it's safe to run on every
// tick even if the previous run already handled everything. Like Phase
// 8B and unlike , there's no display flag to clear alongside the
// status - the homepage ranking query reads `status`/`ends_at` directly,
// so flipping the status here is the whole effect.
exports.expireDueCampaigns = async () => {
    const due = await departmentSponsorshipRepository.findExpiredActiveIds();
    let expired = 0;

    for (const candidate of due) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const changed = await departmentSponsorshipRepository.expireIfDue(candidate.id, connection);
            if (!changed) {
                await connection.rollback();
                continue;
            }

            await connection.commit();
            expired += 1;

            notificationService.notify({
                userId: candidate.seller_id,
                type: "department_sponsorship_expired",
                titleKey: "notifications.departmentSponsorship.expired.title",
                messageKey: "notifications.departmentSponsorship.expired.message",
                messageParams: { categoryName: candidate.category_name },
                withEmail: false
            }).catch((err) => logger.warn({ err }, "department sponsorship expiry notify error"));

        } catch (error) {
            await connection.rollback().catch(() => {});
            logger.error({ err: error, campaignId: candidate.id }, "department sponsorship expiry failed for campaign; continuing");
        } finally {
            connection.release();
        }
    }

    return expired;
};

// --- Admin oversight (read-only) -----------------------------------------
exports.listAllCampaigns = async () => {
    return departmentSponsorshipRepository.findAll();
};
