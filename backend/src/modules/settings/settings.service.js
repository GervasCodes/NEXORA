const settingsRepository = require("./settings.repository");
const { DEFAULT_BANDS, parseBandsConfig } = require("../../utils/deliveryPricing");
const { OFFER_RADIUS_KM, OFFER_TIMEOUT_MS } = require("../../constants/orderStatus");

// Fallbacks used only if the row is somehow missing (e.g. migration ran
// but the default INSERT was skipped) - keeps the platform functional
// instead of throwing mid-checkout.
const DEFAULTS = {
    commission_rate: "10",
    rider_delivery_fee: "3000",
    // TZS per 1 USD. Only used to convert a TZS amount into USD for
    // PayPal, which (unlike Snippe) doesn't support TZS as a transaction
    // currency - see providers/paypal.provider.js. Admin-editable so it
    // can be kept roughly in line with the real exchange rate without a
    // deploy; it's a coarse approximation, not a live FX feed.
    usd_exchange_rate: "2600",
    // Tanzania distance-band delivery pricing (migration 033) - see
    // utils/deliveryPricing.js for the shape and getDeliveryDistanceBands
    // below. Only used when both the seller's pickup pin and the order's
    // delivery pin are set; rider_delivery_fee above remains the fallback
    // whenever either pin is missing.
    delivery_distance_bands: JSON.stringify(DEFAULT_BANDS),
    // Flat cost (TZS) a seller pays per day to sponsor one of their own
    // products (migration 051, Phase 8A). Admin-editable like every other
    // rate above; a running campaign snapshots the rate that applied when
    // it was purchased (sponsorship_campaigns.daily_rate), so changing
    // this later never rewrites what a seller already paid.
    sponsorship_daily_rate: "5000",
    // Flat cost (TZS) a seller pays per day to have their store featured
    // in one department's "Featured stores" row (migration 052, Phase
    // 8B). Priced above sponsorship_daily_rate by default since it
    // promotes the whole store's placement, not one product. A running
    // campaign snapshots the rate that applied when purchased
    // (store_featured_campaigns.daily_rate), same reasoning as
    // sponsorship_daily_rate above.
    featured_store_daily_rate: "8000",
    // Flat cost (TZS) a seller pays per day to sponsor an entire department
    // on the homepage grid (migration 053, Phase 8C). Priced above
    // featured_store_daily_rate since it's homepage-wide visibility, not a
    // placement within a department a shopper has already opened. A
    // running campaign snapshots the rate that applied when purchased
    // (department_sponsorship_campaigns.daily_rate), same reasoning as the
    // two rates above.
    department_sponsorship_daily_rate: "12000",
    // Days after delivery, with no open dispute, before a seller's held
    // order earnings become withdrawable (migration 054, Phase 9B). Not
    // read anywhere yet - Phase 9D's release job is the first caller of
    // getEscrowHoldDays() below.
    escrow_hold_days: "5",

    // Group buys (Phase 3) - how long after a group buy's deadline
    // resolves to 'successful' a participant still has to complete their
    // discounted checkout before forfeiting their spot. Was a hardcoded
    // constant in groupBuy.service.js; admin-editable like every other
    // rate/window above now.
    group_buy_claim_window_hours: "48",

    // Escalating search radius for nearest-agent dispatch matching
    // (Phase 1, Durable Dispatch Foundation - see
    // delivery.service.js#offerToNextCandidate). Ascending km steps: an
    // order first only offers to agents within the smallest radius, and
    // automatically widens to the next step once nobody's left to offer
    // at the current one, before finally falling back to the manual
    // "available for pickup" pool. Kept in the same admin-editable
    // key/value store as every other rate above (mirrors
    // getDeliveryDistanceBands' JSON-in-a-setting-value shape) rather
    // than a dedicated table, since - like the distance bands - this is
    // a single small config blob, not per-row data. The old single
    // OFFER_RADIUS_KM constant (still exported from constants/orderStatus.js
    // for anything reading it directly) sits as the middle step by
    // default, so a fresh install's matching behavior is unchanged until
    // an admin actually edits this.
    delivery_offer_radius_steps_km: JSON.stringify([5, OFFER_RADIUS_KM, 30]),
    // How long a single offered agent has to accept before dispatch
    // moves on to the next candidate (or the next radius step, once a
    // radius is exhausted) - same value OFFER_TIMEOUT_MS always was,
    // just now admin-editable instead of a fixed constant.
    delivery_offer_timeout_ms: String(OFFER_TIMEOUT_MS),

    // Monetization Master Switch (migration 079). Each flag lets NEXORA
    // launch fully free and turn a specific monetization stream on later
    // from the admin panel, with no redeploy or code change - see
    // updateMonetizationSettings()/getMonetizationFlags() below and
    // docs/DATABASE.md. Stored as the strings "true"/"false" (not "1"/"0")
    // to read unambiguously in the admin UI and audit log metadata.
    // Default OFF for every flag, matching a free launch.
    monetization_subscriptions_enabled: "false",
    monetization_commission_enabled: "false",
    monetization_sponsorship_enabled: "false",

    // Nexora AI . ai_enabled is a master switch
    // independent of whether a provider is actually configured via env
    // (see modules/ai/providers/registry.js) - both must be true for any
    // AI feature to call out to a provider; either one off falls back to
    // the same non-AI behavior. Caps are enforced by
    // modules/ai/ai.service.js#checkSpendGuard against ai_usage_log sums.
    ai_enabled: "true",
    ai_daily_token_cap_per_user: "20000",
    ai_monthly_token_cap_per_user: "300000",
    ai_daily_token_cap_global: "2000000",
    ai_monthly_token_cap_global: "30000000",

    // Wallets, escrow, COD & withdrawals (master prompt Phase 2) - see
    // wallet.service.js#requestWithdrawal / payment.service.js#initiateWalletTopUp
    // / order.service.js#checkout for the readers of each of these.
    withdrawal_min_amount: "5000",
    withdrawal_max_amount: "5000000",
    // Per day, by the seller's users.verification_tier.
    withdrawal_daily_cap_none: "200000",
    withdrawal_daily_cap_id_verified: "2000000",
    withdrawal_daily_cap_business_verified: "10000000",
    // Hours a seller's FIRST withdrawal to a given payout method+details
    // combination is held before an admin can approve it.
    withdrawal_new_payout_hold_hours: "24",
    // A seller with this many currently open/under_review disputes cannot
    // request a new withdrawal.
    withdrawal_open_dispute_block_threshold: "3",
    topup_min_amount: "1000",
    topup_max_amount: "3000000",
    // Per day, by the buyer's KYC tier (kyc.service.js's tier0/1/2).
    topup_daily_cap_tier0: "500000",
    topup_daily_cap_tier1: "2000000",
    topup_daily_cap_tier2: "10000000",
    // Hours after `delivered`, with no open dispute, before a Cash on
    // Delivery order is auto-confirmed instead of waiting on the buyer.
    cod_auto_confirm_hours: "48",
    // A buyer with this many "refused" Cash on Delivery deliveries loses
    // access to the Cash on Delivery payment method at checkout.
    cod_block_after_refused_count: "3",

    // Phase 7 guardrails. commission_rate_max caps what an admin can set;
    // usd_exchange_rate_max_change_percent is the band beyond which a rate
    // change needs a second confirmation; retention 0 = keep documents.
    commission_rate_max: "30",
    usd_exchange_rate_max_change_percent: "10",
    approved_document_retention_days: "0"
};

const ESCROW_HOLD_MIN_DAYS = 0;
const ESCROW_HOLD_MAX_DAYS = 60;

const badRequest = (message, extra = {}) => {
    const error = new Error(message);
    error.status = 400;
    Object.assign(error, extra);
    return error;
};

const isEnabled = (value) => value === "true" || value === true;

// platform_settings is read on nearly every order (commission),
// completed delivery (rider fee), and verification page load (fee
// amount) - but it only ever changes when an admin edits it, which is
// rare. A short TTL cache turns "one DB round trip per request" into
// "one DB round trip per CACHE_TTL_MS window", with correctness intact:
// updateSettings() below invalidates it immediately on write, so a change
// is visible to every new request right away, not up to 30s later.
const CACHE_TTL_MS = 30_000;
let cache = null;
let cacheExpiresAt = 0;

const getCachedAll = async () => {
    if (cache && Date.now() < cacheExpiresAt) {
        return cache;
    }

    const rows = await settingsRepository.findAll();
    const map = { ...DEFAULTS };
    rows.forEach((row) => {
        map[row.setting_key] = row.setting_value;
    });

    cache = map;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return cache;
};

const invalidateCache = () => {
    cache = null;
    cacheExpiresAt = 0;
};

exports.getAll = async () => getCachedAll();

// Platform's cut, as a percentage (e.g. 10 => 10%)
exports.getCommissionRate = async () => {
    const map = await getCachedAll();
    return Number(map.commission_rate);
};

// Flat amount (TZS) paid to a delivery agent per completed delivery
exports.getRiderDeliveryFee = async () => {
    const map = await getCachedAll();
    return Number(map.rider_delivery_fee);
};

// TZS per 1 USD - see DEFAULTS comment above.
exports.getUsdExchangeRate = async () => {
    const map = await getCachedAll();
    return Number(map.usd_exchange_rate);
};

// Parsed { bands, per_km_beyond } config for Tanzania distance-based
// delivery pricing - see utils/deliveryPricing.js. Always returns a
// usable config (falls back to DEFAULT_BANDS if the stored value is
// missing or corrupt), so callers never need their own fallback.
exports.getDeliveryDistanceBands = async () => {
    const map = await getCachedAll();
    return parseBandsConfig(map.delivery_distance_bands);
};

// Ascending km steps for escalating-radius dispatch matching - see the
// DEFAULTS comment above. Always returns a usable, ascending, non-empty
// array (falling back to the default steps if the stored value is
// missing/corrupt/malformed), same "callers never need their own
// fallback" guarantee getDeliveryDistanceBands gives.
exports.getDeliveryOfferRadiusStepsKm = async () => {
    const map = await getCachedAll();

    try {
        const parsed = JSON.parse(map.delivery_offer_radius_steps_km);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((km) => typeof km === "number" && km > 0)) {
            return [...parsed].sort((a, b) => a - b);
        }
    } catch {
        // Falls through to the default below.
    }

    return JSON.parse(DEFAULTS.delivery_offer_radius_steps_km);
};

// How long (ms) a single offered dispatch candidate has to respond
// before dispatch advances - see the DEFAULTS comment above. Falls back
// to the OFFER_TIMEOUT_MS constant if the stored value is missing or not
// a usable positive number.
exports.getDeliveryOfferTimeoutMs = async () => {
    const map = await getCachedAll();
    const value = Number(map.delivery_offer_timeout_ms);
    return Number.isFinite(value) && value > 0 ? value : OFFER_TIMEOUT_MS;
};

// Flat cost (TZS) a seller currently pays per day to sponsor one product.
exports.getSponsorshipDailyRate = async () => {
    const map = await getCachedAll();
    return Number(map.sponsorship_daily_rate);
};

// Flat cost (TZS) a seller currently pays per day to have their store
// featured in one department.
exports.getFeaturedStoreDailyRate = async () => {
    const map = await getCachedAll();
    return Number(map.featured_store_daily_rate);
};

// Flat cost (TZS) a seller currently pays per day to sponsor an entire
// department on the homepage grid.
exports.getDepartmentSponsorshipDailyRate = async () => {
    const map = await getCachedAll();
    return Number(map.department_sponsorship_daily_rate);
};

// Days after delivery, with no open dispute, before a seller's held
// order earnings become withdrawable. Unused until Phase 9D's release
// job calls this.
exports.getEscrowHoldDays = async () => {
    const map = await getCachedAll();
    return Number(map.escrow_hold_days);
};

exports.getApprovedDocumentRetentionDays = async () => {
    const map = await getCachedAll();
    return Number(map.approved_document_retention_days);
};

exports.getCommissionRateMax = async () => {
    const map = await getCachedAll();
    const max = Number(map.commission_rate_max);
    return Number.isFinite(max) && max > 0 ? max : 30;
};

exports.getGroupBuyClaimWindowHours = async () => {
    const map = await getCachedAll();
    return Number(map.group_buy_claim_window_hours);
};

// ---- Disputes & returns (Phase 5) ----------------------------------------

exports.getReturnWindowDays = async () => {
    const map = await getCachedAll();
    return Number(map.return_window_days);
};

exports.getReturnWindowInsuredDays = async () => {
    const map = await getCachedAll();
    return Number(map.return_window_insured_days);
};

exports.getDisputeSellerResponseHours = async () => {
    const map = await getCachedAll();
    return Number(map.dispute_seller_response_hours);
};

// ---- Wallets, escrow, COD & withdrawals (Phase 2) ------------------------

exports.getWithdrawalLimits = async () => {
    const map = await getCachedAll();
    return {
        minAmount: Number(map.withdrawal_min_amount),
        maxAmount: Number(map.withdrawal_max_amount),
        dailyCapByTier: {
            none: Number(map.withdrawal_daily_cap_none),
            id_verified: Number(map.withdrawal_daily_cap_id_verified),
            business_verified: Number(map.withdrawal_daily_cap_business_verified)
        },
        newPayoutHoldHours: Number(map.withdrawal_new_payout_hold_hours),
        openDisputeBlockThreshold: Number(map.withdrawal_open_dispute_block_threshold)
    };
};

exports.getTopUpLimits = async () => {
    const map = await getCachedAll();
    return {
        minAmount: Number(map.topup_min_amount),
        maxAmount: Number(map.topup_max_amount),
        dailyCapByTier: {
            tier0: Number(map.topup_daily_cap_tier0),
            tier1: Number(map.topup_daily_cap_tier1),
            tier2: Number(map.topup_daily_cap_tier2)
        }
    };
};

exports.getCodAutoConfirmHours = async () => {
    const map = await getCachedAll();
    return Number(map.cod_auto_confirm_hours);
};

exports.getCodBlockAfterRefusedCount = async () => {
    const map = await getCachedAll();
    return Number(map.cod_block_after_refused_count);
};

// ---- Monetization Master Switch ------------------------------------------
// Each getter below is the single enforcement point its domain module
// reads before creating a payment request:
//   - subscription.service.js#getEffectiveCommissionRate reads commission
//   - subscription.controller.js's subscribe* actions read subscriptions
//   - sponsorship/featuredStore/departmentSponsorship .service.js#createCampaign read sponsorship
// All default OFF (see DEFAULTS above) so a fresh launch is free by default.
// (The one-time seller verification fee that used to be a fourth flag
// here was retired - the Verified Seller badge is now free and follows
// account approval alone, see seller.service.js#syncBadge.)

exports.isSubscriptionsMonetizationEnabled = async () => {
    const map = await getCachedAll();
    return isEnabled(map.monetization_subscriptions_enabled);
};

exports.isCommissionMonetizationEnabled = async () => {
    const map = await getCachedAll();
    return isEnabled(map.monetization_commission_enabled);
};

// Whether sellers may buy sponsorship / featured-store / department
// campaigns a la carte from their wallet. This does NOT gate the
// subscription-included credits (1 credit = 1 campaign-day) - those are
// already paid for through the plan, so they work with this flag off. Off
// therefore no longer means "campaigns are free": it means only credits
// can fund a campaign (see sponsorshipCredit.service.js#splitFunding).
exports.isSponsorshipMonetizationEnabled = async () => {
    const map = await getCachedAll();
    return isEnabled(map.monetization_sponsorship_enabled);
};

// Nexora AI master switch + the four spend-guard caps in one call - see
// modules/ai/ai.service.js#checkSpendGuard, the only current caller.
exports.getAiSettings = async () => {
    const map = await getCachedAll();
    return {
        enabled: isEnabled(map.ai_enabled),
        dailyTokenCapPerUser: Number(map.ai_daily_token_cap_per_user),
        monthlyTokenCapPerUser: Number(map.ai_monthly_token_cap_per_user),
        dailyTokenCapGlobal: Number(map.ai_daily_token_cap_global),
        monthlyTokenCapGlobal: Number(map.ai_monthly_token_cap_global)
    };
};

// All four monetization flags at once, plus each one's last-changed
// actor/timestamp pulled from audit_logs (event_type
// "monetization_setting_changed") - the Admin Billing Control Center
// reads this directly rather than combining getAll() with a separate
// audit query itself. Reuses audit_logs per the roadmap's instruction
// instead of adding updated_by/updated_at columns to platform_settings.
exports.getMonetizationStatus = async () => {
    const map = await getCachedAll();
    const auditRepository = require("../audit/audit.repository");

    const flags = [
        "monetization_subscriptions_enabled",
        "monetization_commission_enabled",
        "monetization_sponsorship_enabled"
    ];

    // search() (not findRecent()) since it LEFT JOINs users - gives the
    // Admin Billing Control Center a ready-to-render actor name/email,
    // same shape AdminAuditLogs.jsx already renders for other events.
    const { rows: recentChanges } = await auditRepository.search({
        eventTypes: ["monetization_setting_changed"],
        pageSize: 100
    });

    const lastChangeFor = (key) => recentChanges.find((row) => {
        const metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
        return metadata?.setting_key === key;
    });

    return flags.reduce((acc, key) => {
        const lastChange = lastChangeFor(key);
        acc[key] = {
            enabled: isEnabled(map[key]),
            lastChangedBy: lastChange
                ? {
                    userId: lastChange.user_id,
                    firstName: lastChange.actor_first_name,
                    lastName: lastChange.actor_last_name,
                    email: lastChange.actor_email
                }
                : null,
            lastChangedAt: lastChange ? lastChange.created_at : null
        };
        return acc;
    }, {});
};

// Admin-only. Flips one or more of the four monetization flags and
// writes an audit_logs entry per changed flag (old -> new value),
// reusing the existing audit_logs table per the roadmap rather than
// adding new tracking columns. Only writes/logs keys that actually
// changed, so toggling one flag doesn't spam four audit rows.
exports.updateMonetizationSettings = async (data, adminId) => {
    const auditService = require("../audit/audit.service");
    const map = await getCachedAll();

    const flagKeys = [
        "monetization_subscriptions_enabled",
        "monetization_commission_enabled",
        "monetization_sponsorship_enabled"
    ];

    for (const key of flagKeys) {
        if (data[key] === undefined) continue;

        const nextValue = data[key] ? "true" : "false";
        const previousValue = map[key];
        if (nextValue === previousValue) continue;

        await settingsRepository.upsert(key, nextValue);

        auditService.log({
            userId: adminId,
            eventType: "monetization_setting_changed",
            description: `Admin ${nextValue === "true" ? "enabled" : "disabled"} ${key}`,
            metadata: { setting_key: key, previous_value: previousValue, new_value: nextValue }
        });
    }

    invalidateCache();
    return exports.getMonetizationStatus();
};

// Public: same 4 monetization flags the Admin Billing Control Center
// manages (settings.service.js), but without the audit/actor detail -
// this is what sellers/providers see on their own billing status
// banners (Trust & Monetization Communication roadmap section), not an
// admin-only view.
exports.getPublicMonetizationStatus = async () => {
    const map = await getCachedAll();

    const flagKeys = [
        "monetization_subscriptions_enabled",
        "monetization_commission_enabled",
        "monetization_sponsorship_enabled"
    ];

    return flagKeys.reduce((acc, key) => {
        acc[key] = { enabled: isEnabled(map[key]) };
        return acc;
    }, {});
};

// Writes only keys whose value actually changes, records old -> new in
// platform_setting_history, and enforces the Phase 7 guardrails:
//  - commission_rate is capped at commission_rate_max and a change needs
//    confirm_commission_change: true (the UI shows current -> new first);
//  - usd_exchange_rate moves beyond usd_exchange_rate_max_change_percent need
//    confirm_large_exchange_rate_change: true;
//  - escrow_hold_days is bounded;
//  - expected_updated_at (ISO time the admin loaded the page) rejects the save
//    if any key being changed was edited by someone else since.
const asComparable = (value) => (value === undefined || value === null ? "" : String(value));

exports.updateSettings = async (data, { actorId = null } = {}) => {
    const { rows: currentRows, map: current } = await (async () => {
        const rows = await settingsRepository.findAll();
        const map = { ...DEFAULTS };
        rows.forEach((row) => { map[row.setting_key] = row.setting_value; });
        return { rows, map };
    })();
    const updatedAtByKey = Object.fromEntries(currentRows.map((r) => [r.setting_key, r.updated_at]));

    const NUMBER_KEYS = [
        "commission_rate", "rider_delivery_fee", "usd_exchange_rate",
        "sponsorship_daily_rate", "featured_store_daily_rate", "department_sponsorship_daily_rate",
        "escrow_hold_days",
        "withdrawal_min_amount", "withdrawal_max_amount",
        "withdrawal_daily_cap_none", "withdrawal_daily_cap_id_verified", "withdrawal_daily_cap_business_verified",
        "withdrawal_new_payout_hold_hours", "withdrawal_open_dispute_block_threshold",
        "topup_min_amount", "topup_max_amount",
        "topup_daily_cap_tier0", "topup_daily_cap_tier1", "topup_daily_cap_tier2",
        "cod_auto_confirm_hours", "cod_block_after_refused_count",
        "delivery_offer_timeout_ms",
        "ai_daily_token_cap_per_user", "ai_monthly_token_cap_per_user",
        "ai_daily_token_cap_global", "ai_monthly_token_cap_global",
        "approved_document_retention_days"
    ];

    const changes = [];
    const queue = (key, nextValue) => {
        if (asComparable(current[key]) !== nextValue) {
            changes.push({ key, oldValue: current[key] === undefined ? null : String(current[key]), newValue: nextValue });
        }
    };

    for (const key of NUMBER_KEYS) {
        if (data[key] !== undefined) queue(key, String(data[key]));
    }
    if (data.delivery_distance_bands !== undefined) {
        queue("delivery_distance_bands", JSON.stringify(data.delivery_distance_bands));
    }
    if (data.delivery_offer_radius_steps_km !== undefined) {
        queue("delivery_offer_radius_steps_km", JSON.stringify(data.delivery_offer_radius_steps_km));
    }
    if (data.ai_enabled !== undefined) {
        queue("ai_enabled", data.ai_enabled ? "true" : "false");
    }

    const changing = (key) => changes.find((c) => c.key === key);

    const commission = changing("commission_rate");
    if (commission) {
        const max = Number(current.commission_rate_max) || 30;
        if (Number(commission.newValue) > max) {
            throw badRequest(`Commission cannot be set above the platform maximum of ${max}%.`);
        }
        if (data.confirm_commission_change !== true) {
            throw badRequest(
                `Changing commission from ${commission.oldValue}% to ${commission.newValue}% needs confirmation.`,
                { code: "CONFIRMATION_REQUIRED", field: "commission_rate" }
            );
        }
    }

    const fx = changing("usd_exchange_rate");
    if (fx) {
        const previous = Number(fx.oldValue);
        const band = Number(current.usd_exchange_rate_max_change_percent) || 10;
        const movedPercent = previous > 0 ? (Math.abs(Number(fx.newValue) - previous) / previous) * 100 : 0;
        if (movedPercent > band && data.confirm_large_exchange_rate_change !== true) {
            throw badRequest(
                `This moves the exchange rate by ${movedPercent.toFixed(1)}% (limit without extra confirmation: ${band}%).`,
                { code: "CONFIRMATION_REQUIRED", field: "usd_exchange_rate" }
            );
        }
    }

    const escrow = changing("escrow_hold_days");
    if (escrow) {
        const days = Number(escrow.newValue);
        if (!Number.isInteger(days) || days < ESCROW_HOLD_MIN_DAYS || days > ESCROW_HOLD_MAX_DAYS) {
            throw badRequest(`Escrow hold must be a whole number of days from ${ESCROW_HOLD_MIN_DAYS} to ${ESCROW_HOLD_MAX_DAYS}.`);
        }
    }

    if (data.expected_updated_at) {
        const loadedAt = new Date(data.expected_updated_at).getTime();
        const stale = changes.find((c) => {
            const t = updatedAtByKey[c.key] ? new Date(updatedAtByKey[c.key]).getTime() : 0;
            return Number.isFinite(loadedAt) && t > loadedAt;
        });
        if (stale) {
            const error = badRequest(
                `"${stale.key}" was changed by someone else after you opened this page. Reload and try again.`,
                { code: "STALE_SETTINGS" }
            );
            error.status = 409;
            throw error;
        }
    }

    for (const change of changes) {
        await settingsRepository.upsert(change.key, change.newValue);
        await settingsRepository.recordHistory(change.key, change.oldValue, change.newValue, actorId);
    }

    invalidateCache();
    return exports.getAll();
};

exports.getSettingHistory = async (key, limit = 50) => settingsRepository.findHistory(key, limit);

// "Last changed by / when" for every key that has history.
exports.getSettingsMeta = async () => settingsRepository.findLastChanges();
