// Nexora Assistant - curated knowledge pack (Workstream A, Phase 1).
//
// WHAT THIS IS
// A hand-curated, public-safe summary of how NEXORA works, written so the
// chat assistant can answer questions about the platform instead of
// refusing everything outside six FAQ entries. It is INFORMATION ONLY:
// every section describes what a person can do themselves and where in
// the app, never an action the assistant performs.
//
// SOURCES (summarised, not copied wholesale)
// docs/operations/user-manual.md, docs/business/business-rules.md,
// docs/business/company-overview.md, frontend/src/legal/*.md and the
// real rules in the code (e.g. constants/orderStatus.js#CANCELLABLE_STATUSES,
// booking.service.js#CANCELLABLE_STATUSES). The legal pages remain the
// authoritative full text; this pack points at them.
//
// WHAT MUST NEVER BE ADDED HERE (public assistant, public endpoint)
// ESCROW_* / licensing reviews, SECURITY_* checklists, known-issues,
// administrator manual, fraud internals, AI token caps, credentials,
// internal file paths, BRELA/TIN identifiers, admin-only workflows.
// ai/tests assert several of these terms never appear.
//
// LIVE NUMBERS
// Fees, windows and limits are read from platform_settings (via
// settings.service#getAll) every time the pack is built, so the assistant
// never repeats a stale number. If a setting cannot be read, a section
// falls back to wording WITHOUT a number rather than guessing one.
//
// AUDIENCE (roadmap decision 2)
// Signed-out visitors and buyers get buyer information plus GENERAL seller
// information (how to become a seller, what is needed). Money-sensitive
// seller details (wallet, withdrawal limits, commission) are included only
// for signed-in sellers (and admins). Delivery-agent specifics only for
// delivery agents (and admins).

const logger = require("../../../utils/logger");

// OWNER CONFIRMATION REQUIRED: these values come from
// frontend/src/legal/company-information.md and Marketing.jsx. Docs flag the
// email as a personal address rather than a company-domain mailbox, and the
// values were never verified by the owner. Change them HERE (single place).
const SUPPORT_CONTACT = {
    // Set SUPPORT_EMAIL (the same variable emails use) to move to a company mailbox.
    email: process.env.SUPPORT_EMAIL || "amgerryofficial@gmail.com",
    phone: "+255622387905",
    contactPage: "/contact"
};

// ---- helpers -------------------------------------------------------------

const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

// 1500000 -> "1,500,000"
const money = (value) => {
    const n = toNumber(value);
    return n === null ? null : n.toLocaleString("en-US");
};

// "TZS 5,000", or null when the setting is missing/invalid.
const tzs = (value) => {
    const formatted = money(value);
    return formatted === null ? null : `TZS ${formatted}`;
};

// Only the literal string "true" counts as on; anything else (missing,
// "false", unreadable) is treated as not confirmed on.
const isOn = (value) => value === "true" || value === true;

// Joins non-empty lines so a missing setting simply drops its sentence.
const lines = (...parts) => parts.filter(Boolean).join("\n");

// ---- sections ------------------------------------------------------------
// audience: "everyone" | "seller" | "delivery"
// build(s) receives the platform_settings map (may be empty) and returns text.

const SECTIONS = [
    {
        id: "about",
        title: "What NEXORA is",
        audience: "everyone",
        build: () => lines(
            "NEXORA is an online marketplace in Tanzania where independent sellers and service providers reach buyers. Buyers can shop for products and book services; delivery is tracked from the seller to the buyer's door.",
            "Tagline: \"Shop local. Sell local. Delivered to your door.\"",
            "NEXORA is a marketplace, not the merchant: products and services are owned, priced and described by the independent sellers. NEXORA provides the platform, payment protection, tracking and dispute handling.",
            "The app is available in English and Kiswahili (switch language in the header or on the Account page) and in light, dark or system theme.",
            "Useful pages: /how-it-works, /about, /contact, /guides (buying guides), /group-buys, /live-selling, /status (service status)."
        )
    },
    {
        id: "account",
        title: "Accounts and signing in",
        audience: "everyone",
        build: () => lines(
            "Create an account at /register as a buyer, seller or delivery agent. You need first and last name, a valid email, a password of at least 8 characters, and you must accept the Terms and Privacy Policy. A username and a referral code are optional. Google sign-in is also available. Delivery agents also give a vehicle type and plate number.",
            "Signing in at /login with email and password always includes a one-time code sent by email (valid for 5 minutes; you can ask for a new one after 1 minute). If the code does not arrive: check spam, wait a minute and resend, confirm the email address, then contact support.",
            "Too many wrong password attempts temporarily lock the account (5, then 15, then 60 minutes). Wait, or reset the password at /forgot-password.",
            "Only buyer accounts can buy. A seller account that wants to buy needs a separate buyer account.",
            "If an account shows as suspended, contact support. Sellers and delivery agents must be approved before they can list or deliver."
        )
    },
    {
        id: "browse",
        title: "Finding products and services",
        audience: "everyone",
        build: () => lines(
            "Browse from the home page, /products, /services, store pages (/stores/<store>), departments, or the search box (/search). The /feed page is a swipeable product feed.",
            "Product pages show price, variants, photos, reviews and buyer questions. Tap the heart to save items (see /saved). Recently viewed items and recommendations appear on the home page.",
            "Group buys (/group-buys) let several buyers unlock a shared discount; live selling (/live-selling) shows sellers' live sessions."
        )
    },
    {
        id: "buying",
        title: "Buying: cart, checkout and payment",
        audience: "everyone",
        build: (s) => {
            const maxLines = toNumber(s.max_cart_line_items);
            const maxQty = toNumber(s.max_quantity_per_cart_line);
            return lines(
                "Steps: add items to the cart (/cart), go to /checkout, confirm your delivery address and delivery option, choose a payment method, accept the terms, then pay as prompted. A signed-in buyer's saved addresses are offered at checkout.",
                "Payment methods: mobile money (for example M-Pesa, Mixx by Yas, Airtel Money, HaloPesa), card payments, PayPal, the NEXORA wallet, and cash on delivery where available. What you see at checkout depends on the seller and your location.",
                "An order shows as paid only after the payment provider confirms it. If a payment looks pending, wait for the confirmation and do not pay twice; the status banner updates by itself.",
                "If a cart has items from several sellers, you get one order made of one part per seller; each part has its own status and delivery.",
                maxLines !== null && maxQty !== null ? `A cart holds up to ${maxLines} different items and up to ${maxQty} units per item.` : null,
                "Cash on delivery: pay the rider when the item arrives. Cash-on-delivery orders you do not confirm are confirmed automatically after a set time"
                    + (toNumber(s.cod_auto_confirm_hours) !== null ? ` (${toNumber(s.cod_auto_confirm_hours)} hours)` : "")
                    + ". Cash on delivery can be blocked after repeated refused deliveries.",
                "Prices, delivery fees and charges shown at checkout are final for that purchase. An optional buyer protection add-on can be bought at checkout; it extends the return window and is described in the Insurance Policy (/legal/insurance-policy).",
                "Common problems: \"cart is empty\" at checkout (refresh the cart; if it continues, contact support); cannot add to cart (you are signed in with a non-buyer account)."
            );
        }
    },
    {
        id: "delivery",
        title: "Delivery and tracking",
        audience: "everyone",
        build: () => lines(
            "Each order is delivered either by NEXORA's delivery network or, if the seller chose that, by the seller's own delivery. Follow an order at /orders/<id> and see live tracking at /orders/<id>/tracking.",
            "Delivery time shown at checkout is an estimate, not a guarantee; traffic, weather, address problems and courier availability can change it.",
            "At handover the rider confirms delivery with your code, or with a photo and location. Confirm receipt when your goods arrive, then leave a review (photos are allowed).",
            "The delivery fee depends on the delivery option and, for platform delivery, on the distance between the seller and your delivery pin. The exact fee is always shown at checkout before you pay; never quote a fee from memory.",
            "Make sure your delivery address and phone number are correct and reachable. If delivery fails because of an incorrect or inaccessible address, a re-delivery fee can apply."
        )
    },
    {
        id: "bookings",
        title: "Booking services",
        audience: "everyone",
        build: () => lines(
            "Open a service (/services), choose dates or an available time, pay, and wait for the provider to confirm. Follow it at /bookings and /bookings/<id>.",
            "If any chosen date is full or closed, nothing is booked. A booking can be cancelled while it is pending or confirmed; once it is active or completed it is too late to cancel outright and a dispute is the route. Cancellation terms are shown on the service at booking time (see the Refund Policy).",
            "Booking statuses: pending, confirmed, active, completed, cancelled, refunded, rejected."
        )
    },
    {
        id: "cancel_returns_disputes",
        title: "Cancelling, returns, disputes and refunds",
        audience: "everyone",
        build: (s) => {
            const returnDays = toNumber(s.return_window_days);
            const insuredDays = toNumber(s.return_window_insured_days);
            const responseHours = toNumber(s.dispute_seller_response_hours);
            return lines(
                "Cancel an order yourself from its order page while it is still pending or processing. Once the seller marks it shipped, self-service cancellation is no longer available; use a return (if delivered) or a dispute instead. A multi-seller order is cancelled as a whole, not one seller's part.",
                returnDays !== null
                    ? `Returns: open one at /returns/new on a delivered order within ${returnDays} days of delivery${insuredDays !== null ? ` (${insuredDays} days if the buyer protection add-on was bought for that order)` : ""}. Reasons: damaged item, wrong item, defective product, not as described, changed mind, other. Steps: requested, approved or rejected, shipped back, received, refunded. You can cancel your own return while it is requested or approved.`
                    : "Returns: open one at /returns/new on a delivered order within the return window shown in the app (shorter by default, longer if the buyer protection add-on was bought). Reasons: damaged item, wrong item, defective product, not as described, changed mind, other.",
                "Disputes: if something went wrong (damaged, defective, wrong item, never arrived, badly delayed), use \"Report a problem\" on the order or go to /disputes/new, and attach photos. "
                    + (responseHours !== null ? `The seller has ${responseHours} hours to respond, then a NEXORA admin reviews it.` : "The seller gets a limited time to respond, then a NEXORA admin reviews it.")
                    + " Outcomes: full refund, partial refund, replacement, compensation, or no action with a reason. Report problems as soon as possible.",
                "How refunds are paid: refunds are settled against the seller's earnings. Returning money to your original payment method is not fully automated for every payment provider; for some, a NEXORA admin completes it manually outside the app, which can take longer. Keep your dispute or return record as your reference. A refund to your NEXORA wallet can be used on future orders or withdrawn.",
                "Coupons are not refunded as cash (you get back what you actually paid). Opening disputes in bad faith can lead to account restrictions.",
                "Who is responsible for damage or delay (seller, delivery agent or neither) is set out in the Delivery Liability Policy (/legal/delivery-liability-policy). NEXORA does not sell a separate insurance product; protection works through disputes (see /legal/insurance-policy). Your consumer rights under Tanzanian law are not removed by these policies."
            );
        }
    },
    {
        id: "buyer_wallet",
        title: "Buyer wallet and identity verification",
        audience: "everyone",
        build: (s) => {
            const min = tzs(s.topup_min_amount);
            const max = tzs(s.topup_max_amount);
            return lines(
                "Buyers have a NEXORA wallet at /account/wallet. "
                    + (min && max ? `A single top-up must be between ${min} and ${max}. ` : "Top-ups have minimum, maximum and daily limits. ")
                    + "Daily limits rise as you verify your identity at /account/kyc.",
                "Verification (KYC) tiers raise limits for buyers: light signup, ID verified, and enhanced verification. Order size and cash-on-delivery limits also rise with higher tiers."
            );
        }
    },
    {
        id: "messages_support",
        title: "Messages, support and policies",
        audience: "everyone",
        build: () => lines(
            "Message sellers and delivery agents at /messages. For help with an order, an account or selling, use the support widget in the app or the Contact page (/contact).",
            `Support contact: email ${SUPPORT_CONTACT.email}, phone ${SUPPORT_CONTACT.phone}.`,
            "Policies (full text in the app): Terms of Service /legal/terms-of-service, Privacy Policy /legal/privacy-policy, Refund Policy /legal/refund-policy, Delivery Liability Policy /legal/delivery-liability-policy, Insurance Policy /legal/insurance-policy, Cookie Policy /legal/cookie-policy, Vendor Agreement /legal/vendor-agreement, Company information /legal/company-information.",
            "Privacy in short: NEXORA uses your data to run your account, orders and deliveries; analytics cookies load only if you accept the cookie banner. For specifics, direct people to the Privacy Policy rather than guessing.",
            "Loyalty points and referrals are at /loyalty; affiliate links are at /affiliate. Other pages: /status shows whether services are running; if a feature says it is temporarily unavailable, it is in maintenance, so try again later."
        )
    },
    {
        id: "sell_overview",
        title: "Selling on NEXORA (general)",
        audience: "everyone",
        build: () => lines(
            "To become a seller: create an account choosing the seller role (or choose \"Become a seller\" from the account menu), upload the requested documents, and wait for approval. The Verified Seller badge is free and follows account approval.",
            "After approval: set up your store at /seller/setup (branding and payout details), list products at /seller/products/new or services at /seller/services/new, set service availability at /seller/availability, and handle orders at /seller/orders.",
            "Sellers also get growth tools such as promotion, subscription plans, group buys, live selling, affiliate links, analytics, and stock/sales/expenses/POS tools for running the business.",
            "Fees, wallet and payout details for sellers are shown inside the signed-in seller area. For account-specific questions, a seller should check their dashboard or contact support."
        )
    },
    {
        id: "sell_money",
        title: "Seller wallet, commission and withdrawals",
        audience: "seller",
        build: (s) => {
            const holdDays = toNumber(s.escrow_hold_days);
            const min = tzs(s.withdrawal_min_amount);
            const max = tzs(s.withdrawal_max_amount);
            const capNone = tzs(s.withdrawal_daily_cap_none);
            const capId = tzs(s.withdrawal_daily_cap_id_verified);
            const capBiz = tzs(s.withdrawal_daily_cap_business_verified);
            const hold24 = toNumber(s.withdrawal_new_payout_hold_hours);
            const disputeBlock = toNumber(s.withdrawal_open_dispute_block_threshold);
            const commission = toNumber(s.commission_rate);
            return lines(
                "Earnings: after a paid order, your net earnings (after commission, where charged) show as held in your seller wallet (/seller/wallet). They become available after delivery, a hold period"
                    + (holdDays !== null ? ` (currently ${holdDays} days)` : "")
                    + " and no open dispute on that item. Cash-on-delivery sales are credited when the buyer confirms receipt, with the commission deducted.",
                isOn(s.monetization_commission_enabled) && commission !== null
                    ? `Commission: the default platform commission is ${commission}% of a sale. A paid subscription plan can give a lower rate. Commission is recorded per sale, so later plan changes do not alter past sales.`
                    : "Commission: whether commission is being charged at the moment, and the rate, is shown in your seller area; check there or ask support rather than assuming.",
                "Withdrawals: request from /seller/wallet. "
                    + (min && max ? `Each request must be between ${min} and ${max}. ` : "")
                    + (capNone && capId && capBiz ? `Daily limits depend on verification: ${capNone} unverified, ${capId} ID-verified, ${capBiz} business-verified. ` : "Daily limits depend on your verification level. ")
                    + (hold24 !== null ? `A new payout destination waits ${hold24} hours before first use. ` : "")
                    + (disputeBlock !== null ? `You cannot withdraw while you have ${disputeBlock} or more open disputes. ` : "")
                    + "A NEXORA admin approves and pays withdrawals manually; status goes pending, approved, paid (or rejected).",
                "Common problems: cannot list yet (not approved); funds still held (check delivery, the hold period and open disputes); withdrawal refused (check the limits above, new payout destination, open disputes).",
                "Sellers respond to disputes within the response window; losing disputes or refusing legitimate returns can lead to account action. See the Vendor Agreement (/legal/vendor-agreement)."
            );
        }
    },
    {
        id: "sell_growth",
        title: "Seller promotion, plans and tools",
        audience: "seller",
        build: (s) => lines(
            "Promotion: sponsor a product or feature a store from /seller/promote when those options are enabled"
                + (isOn(s.monetization_sponsorship_enabled)
                    ? (tzs(s.sponsorship_daily_rate) && tzs(s.featured_store_daily_rate)
                        ? `. Current daily rates: sponsorship ${tzs(s.sponsorship_daily_rate)}, featured store ${tzs(s.featured_store_daily_rate)}.`
                        : ".")
                    : ". Check /seller/promote to see whether it is switched on and the current price."),
            "Subscription plans (/seller/subscription) may offer lower commission and extras when plans are enabled; the plans and prices shown there are the ones that apply.",
            "Business tools (stock, sales, purchases, expenses and POS) are under /business/stock or /seller/stock depending on the account type. Sellers can also use group buys, live selling, affiliate links and analytics."
        )
    },
    {
        id: "delivery_agents",
        title: "Delivery agents",
        audience: "delivery",
        build: () => lines(
            "Delivery agents must be approved first. Then open /delivery to see available offers and accept quickly: unanswered offers expire and are offered to others.",
            "Use /delivery/mine to go to pick-up and drop-off; your location is shared while you work (allow location permission in the browser or no offers or tracking will work). Complete handover with the customer's code, or a photo and GPS.",
            "See /delivery/earnings and /delivery/ratings. Delivery business owners manage their team at /delivery/business.",
            "Common problems: no offers (not approved, not online, or no orders nearby); location not updating (location permission)."
        )
    }
];

// ---- assembly ------------------------------------------------------------

const SELLER_ROLES = new Set(["seller", "admin", "super_admin"]);
const DELIVERY_ROLES = new Set(["delivery_agent", "admin", "super_admin"]);

const sectionAllowed = (section, role) => {
    if (section.audience === "everyone") return true;
    if (section.audience === "seller") return SELLER_ROLES.has(role);
    if (section.audience === "delivery") return DELIVERY_ROLES.has(role);
    return false;
};

// Pure and synchronous: builds the pack text for a role from a settings map.
// `role` is null for signed-out visitors. Unknown roles are treated like
// signed-out visitors (least privilege).
const buildKnowledgeText = ({ role = null, settings = {} } = {}) => {
    const safeSettings = settings && typeof settings === "object" ? settings : {};
    return SECTIONS
        .filter((section) => sectionAllowed(section, role))
        .map((section) => {
            let body;
            try {
                body = section.build(safeSettings);
            } catch (error) {
                // A malformed setting must never take the assistant down;
                // skip just that section.
                logger.warn({ err: error, section: section.id }, "[ai] knowledge section failed to build - skipping");
                return null;
            }
            return body ? `## ${section.title}\n${body}` : null;
        })
        .filter(Boolean)
        .join("\n\n");
};

// Async convenience used by the chat flow (wired in Phase 2): loads the
// cached platform settings and builds the text. Never throws - on any
// settings failure it still returns the pack with number-free wording.
const getKnowledgeText = async ({ role = null } = {}) => {
    let settings = {};
    try {
        // Required lazily so unit tests of buildKnowledgeText need no DB.
        const settingsService = require("../../settings/settings.service");
        settings = await settingsService.getAll();
    } catch (error) {
        logger.warn({ err: error }, "[ai] knowledge: could not read platform settings - using wording without live numbers");
    }
    return buildKnowledgeText({ role, settings });
};

module.exports = {
    SUPPORT_CONTACT,
    SECTIONS,
    buildKnowledgeText,
    getKnowledgeText
};
