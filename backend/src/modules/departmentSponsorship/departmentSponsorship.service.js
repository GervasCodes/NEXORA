const db = require("../../config/db");
const departmentSponsorshipRepository = require("./departmentSponsorship.repository");
const productRepository = require("../product/product.repository");
const categoryRepository = require("../category/category.repository");
const walletRepository = require("../wallet/wallet.repository");
const settingsService = require("../settings/settings.service");
const notificationService = require("../notification/notification.service");

// Same bounds as sponsorship.service.js (Phase 8A) and
// featuredStore.service.js (Phase 8B), for the same reason: long enough to
// be useful, short enough that a mistaken purchase can't lock up a large
// chunk of a seller's wallet for very long. Nothing stops them creating a
// new campaign the moment one ends.
const MIN_DAYS = 1;
const MAX_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// What a seller sees before committing to a campaign - the form on
// SellerDepartmentSponsorship.jsx reads this to show "X/day" and compute a
// live total as they change the duration, same shape
// sponsorship.service.js#getPricing / featuredStore.service.js#getPricing
// already use.
exports.getPricing = async () => {
    const dailyRate = await settingsService.getDepartmentSponsorshipDailyRate();
    return { daily_rate: dailyRate, min_days: MIN_DAYS, max_days: MAX_DAYS };
};

// Departments this seller can actually pay to sponsor - only ones they
// have at least one active product listed under, same eligibility rule
// featuredStore.service.js#getEligibleCategories uses (see
// product.repository.js#findActiveCategoriesBySeller).
exports.getEligibleCategories = async (sellerId) => {
    return productRepository.findActiveCategoriesBySeller(sellerId);
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

    const eligibleCategories = await productRepository.findActiveCategoriesBySeller(sellerId);
    if (!eligibleCategories.some((c) => c.id === Number(categoryId))) {
        throw new Error("You need an active, published product in this department before you can sponsor it");
    }

    // A seller paying for a second campaign of their own in a department
    // they're already sponsoring would just be wasted spend - the
    // homepage ordering can't put the same department ahead of itself
    // twice. Blocked here rather than left to silently overlap, same
    // reasoning featuredStore.service.js#createCampaign gives (this does
    // not stop a *different* seller from also sponsoring the same
    // department - see hasActiveForSellerCategory's comment).
    const alreadyActive = await departmentSponsorshipRepository.hasActiveForSellerCategory(sellerId, categoryId);
    if (alreadyActive) {
        throw new Error("You already have an active sponsorship campaign for this department");
    }

    const dailyRate = await settingsService.getDepartmentSponsorshipDailyRate();
    const totalCost = Number((dailyRate * parsedDays).toFixed(2));

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await walletRepository.ensureWallet(sellerId, connection);
        const wallet = await walletRepository.getWalletForUpdate(sellerId, connection);

        if (totalCost > Number(wallet.balance)) {
            throw new Error(
                "Insufficient wallet balance to fund this campaign. Top up from your order earnings, or choose a shorter duration."
            );
        }

        const endsAt = new Date(Date.now() + parsedDays * MS_PER_DAY);

        const campaignId = await departmentSponsorshipRepository.create(
            { sellerId, categoryId, dailyRate, days: parsedDays, totalCost, endsAt },
            connection
        );

        const balanceAfter = await walletRepository.incrementBalance(sellerId, -totalCost, connection);

        await walletRepository.insertTransaction({
            sellerId,
            type: "debit",
            amount: totalCost,
            balanceAfter,
            referenceType: "department_sponsorship_campaign",
            referenceId: campaignId,
            description: `Department sponsorship campaign #${campaignId} for "${category.name}" (${parsedDays} day${parsedDays === 1 ? "" : "s"} at ${dailyRate}/day)`
        }, connection);

        await connection.commit();

        notificationService.notify({
            userId: sellerId,
            type: "department_sponsorship_started",
            titleKey: "notifications.departmentSponsorship.started.title",
            messageKey: "notifications.departmentSponsorship.started.message",
            messageParams: { categoryName: category.name, days: parsedDays, amount: totalCost },
            withEmail: false
        }).catch((err) => console.error("department sponsorship start notify error:", err));

        return { campaignId, totalCost, balance: balanceAfter, endsAt };

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

// Ends a still-running campaign early. Deliberately no pro-rated refund -
// same policy as sponsorship.service.js#cancelCampaign (Phase 8A) and
// featuredStore.service.js#cancelCampaign (Phase 8B) for the same reason
// (see those phases' READMEs' "Not in scope" sections).
exports.cancelCampaign = async (sellerId, campaignId) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const campaign = await departmentSponsorshipRepository.findByIdForUpdate(campaignId, connection);

        if (!campaign || campaign.seller_id !== sellerId) {
            throw new Error("Campaign not found");
        }
        if (campaign.status !== "active") {
            throw new Error(`This campaign is already "${campaign.status}"`);
        }

        await departmentSponsorshipRepository.updateStatus(campaignId, "cancelled", connection);

        await connection.commit();
        return { status: "cancelled" };

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
// 8B and unlike Phase 8A, there's no display flag to clear alongside the
// status - the homepage ranking query reads `status`/`ends_at` directly,
// so flipping the status here is the whole effect.
exports.expireDueCampaigns = async () => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const due = await departmentSponsorshipRepository.findExpiredActive(connection);

        for (const campaign of due) {
            await departmentSponsorshipRepository.updateStatus(campaign.id, "expired", connection);
        }

        await connection.commit();

        for (const campaign of due) {
            notificationService.notify({
                userId: campaign.seller_id,
                type: "department_sponsorship_expired",
                titleKey: "notifications.departmentSponsorship.expired.title",
                messageKey: "notifications.departmentSponsorship.expired.message",
                messageParams: { categoryName: campaign.category_name },
                withEmail: false
            }).catch((err) => console.error("department sponsorship expiry notify error:", err));
        }

        return due.length;

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

// --- Admin oversight (read-only) -----------------------------------------
exports.listAllCampaigns = async () => {
    return departmentSponsorshipRepository.findAll();
};
