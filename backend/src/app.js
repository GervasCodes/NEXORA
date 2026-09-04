const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const helmet = require("helmet");
// Already initialized by server.js requiring ./src/config/sentry before
// this module - requiring it again here just returns the same
// already-configured Sentry instance (Node's module cache), needed for
// Sentry.setupExpressErrorHandler below.
const Sentry = require("./config/sentry");

const db = require("./config/db");
const { apiLimiter } = require("./middleware/rateLimit.middleware");

const authRoutes = require("./modules/auth/auth.routes");
const authMiddleware = require("./middleware/auth.middleware");
const sellerRoutes = require("./modules/seller/seller.routes");
const productRoutes = require("./modules/product/product.routes");
const categoryRoutes = require("./modules/category/category.routes");
const storeTypeRoutes = require("./modules/storeType/storeType.routes");
const serviceCategoryRoutes = require("./modules/serviceCategory/serviceCategory.routes");
const serviceRoutes = require("./modules/service/service.routes");
const availabilityRoutes = require("./modules/availability/availability.routes");
const bookingRoutes = require("./modules/booking/booking.routes");
const storeRoutes = require("./modules/store/store.routes");
const cartRoutes = require("./modules/cart/cart.routes");
const orderRoutes = require("./modules/order/order.routes");
const paymentRoutes = require("./modules/payment/payment.routes");
const deliveryRoutes = require("./modules/delivery/delivery.routes");
const reviewRoutes = require("./modules/review/review.routes");
const notificationRoutes = require("./modules/notification/notification.routes");
const chatRoutes = require("./modules/chat/chat.routes");
const pushRoutes = require("./modules/push/push.routes");
const settingsRoutes = require("./modules/settings/settings.routes");
const adminRoutes = require("./modules/admin/admin.routes");
const adminNotificationRoutes = require("./modules/adminNotification/adminNotification.routes");
const accountVerificationRoutes = require("./modules/accountVerification/accountVerification.routes");
const walletRoutes = require("./modules/wallet/wallet.routes");
const earningsRoutes = require("./modules/earnings/earnings.routes");
const accountRoutes = require("./modules/account/account.routes");
const wishlistRoutes = require("./modules/wishlist/wishlist.routes");
const buyerAddressRoutes = require("./modules/buyerAddress/buyerAddress.routes");
const couponRoutes = require("./modules/coupon/coupon.routes");
const productQuestionRoutes = require("./modules/productQuestion/productQuestion.routes");
const productVariantRoutes = require("./modules/productVariant/productVariant.routes");
const productAlertRoutes = require("./modules/productAlert/productAlert.routes");
const sellerSavedFilterRoutes = require("./modules/sellerSavedFilter/sellerSavedFilter.routes");
const disputeRoutes = require("./modules/dispute/dispute.routes");
const returnRoutes = require("./modules/return/return.routes");
const kycRoutes = require("./modules/kyc/kyc.routes");
const buyerWalletRoutes = require("./modules/buyerWallet/buyerWallet.routes");
const loanRoutes = require("./modules/loan/loan.routes");
const supportRoutes = require("./modules/support/support.routes");
const whatsappRoutes = require("./modules/whatsapp/whatsapp.routes");
const efdRoutes = require("./modules/efd/efd.routes");
const pickupPointRoutes = require("./modules/pickupPoint/pickupPoint.routes");
const contentRoutes = require("./modules/content/content.routes");
const referralRoutes = require("./modules/referral/referral.routes");
const groupBuyRoutes = require("./modules/groupBuy/groupBuy.routes");
const liveSellingRoutes = require("./modules/liveSelling/liveSelling.routes");
const businessRoutes = require("./modules/business/business.routes");
const affiliateRoutes = require("./modules/affiliate/affiliate.routes");
const sponsorshipRoutes = require("./modules/sponsorship/sponsorship.routes");
const featuredStoreRoutes = require("./modules/featuredStore/featuredStore.routes");
const departmentSponsorshipRoutes = require("./modules/departmentSponsorship/departmentSponsorship.routes");
const maintenanceRoutes = require("./modules/maintenance/maintenance.routes");
const subscriptionRoutes = require("./modules/subscription/subscription.routes");
const recommendationRoutes = require("./modules/recommendation/recommendation.routes");
const statusRoutes = require("./modules/status/status.routes");
const aiRoutes = require("./modules/ai/ai.routes");
const errorHandler = require("./middleware/errorHandler");

const authorizeMiddleware = require("./middleware/authorize.middleware");

const app = express();

// Render (like Heroku/most PaaS) puts the app behind a reverse proxy, so
// every request's real client IP only exists in the X-Forwarded-For
// header - req.ip resolves to the proxy's own IP unless this is set.
// Without it, express-rate-limit below keys its rate limits off that one
// shared proxy IP for EVERY user, meaning normal combined traffic from
// real visitors could trip the limiter and lock out the whole site
// within minutes of going live. `1` = trust exactly one hop (Render's
// own proxy) rather than blindly trusting the whole X-Forwarded-For
// chain, which would let a malicious client spoof their own IP.
app.set("trust proxy", 1);

// Middlewares
// CORS_ORIGIN can be a single origin or a comma-separated list. Falls back
// to "*" only if unset, which is fine for local dev but should always be
// set explicitly in production (see backend/.env.example).
const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
    : "*";
app.use(cors({ origin: corsOrigins, credentials: true }));
// Phase 2 (Security Hardening). Generates a fresh per-response nonce so
// the one inline <style> block this backend actually serves (/health,
// below) can be explicitly allow-listed by the CSP without falling back
// to 'unsafe-inline' (which would allow ANY inline style/script, not
// just this one). Registered before helmet so its CSP directive
// callbacks (which read res.locals.cspNonce) always see it set.
app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
    next();
});

// Sets X-Content-Type-Options, X-Frame-Options, HSTS, and friends.
// contentSecurityPolicy used to be entirely disabled here - this is
// mostly a JSON API (the frontend is a separate deployed app) and a
// default CSP would have blocked /health's inline <style> - but "no CSP
// at all" throws away real defense-in-depth for the one HTML response
// this backend does serve, and for any future accidental HTML/script
// reflection in an error page. Scoped instead of removed: nothing here
// needs to load a script, a frame, or content from another origin, so
// almost everything is locked to 'none', with 'self' only where a JSON
// API response might plausibly be fetched by its own frontend.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'none'"],
            // /health's inline <style> block only - see the nonce
            // middleware above and the tag itself further down.
            styleSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
            imgSrc: ["'self'"],
            connectSrc: ["'self'"],
            scriptSrc: ["'none'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'none'"]
        }
    }
}));
// Gzips every JSON/HTML response over the wire - product listings and
// admin tables in particular shrink dramatically, at negligible CPU cost.
app.use(compression());
// Structured per-request access logging (method/path/status/duration,
// request id) - see middleware/requestLogger.middleware.js. Mounted this
// early so the request id it generates (X-Request-Id) is available to
// every handler below, including the raw-body Snippe webhook route.
app.use(require("./middleware/requestLogger.middleware"));

// Snippe webhook signature verification (snippe.provider.js ->
// constructWebhookEvent) needs the exact raw request bytes - once
// express.json() below parses the body into an object, that's gone for
// good. So this one route is registered here, with its own
// express.raw() parser, BEFORE the global express.json() - Express
// handles a fully-matched route and never reaches the later json()
// middleware for this path. Every other route (including the mobile
// money webhooks, which verify a shared-secret header instead of a body
// signature) is fine going through the normal JSON body parser below.
app.post(
    "/api/v1/payments/webhooks/snippe",
    express.raw({ type: "application/json" }),
    require("./modules/payment/payment.controller").snippeWebhook
);

// MalipoPay Card webhook signature verification (malipopayCard.provider.js
// -> constructWebhookEvent) needs the exact raw request bytes too - same
// reasoning and wiring as the Snippe route directly above. This is the
// card-checkout product's webhook only; the mobile-money MalipoPay
// webhook (POST /api/v1/payments/webhooks/malipopay) verifies a
// shared-secret header instead and goes through the normal JSON body
// parser below, unchanged.
app.post(
    "/api/v1/payments/webhooks/malipopay-card",
    express.raw({ type: "application/json" }),
    require("./modules/payment/payment.controller").malipopayCardWebhook
);

// WhatsApp Cloud API inbound webhook (Phase Q3) - same raw-body
// requirement as the two routes directly above, for the same reason
// (X-Hub-Signature-256 verification needs the exact bytes Meta signed,
// see webhookAuth.middleware.js#verifyWhatsAppWebhook). The GET
// verification challenge Meta sends when the webhook URL is first
// configured doesn't carry a body to verify, so it skips straight to
// the controller.
app.get("/api/v1/whatsapp/webhook", require("./modules/whatsapp/whatsapp.controller").verifyWebhook);
app.post(
    "/api/v1/whatsapp/webhook",
    express.raw({ type: "application/json" }),
    require("./middleware/webhookAuth.middleware").verifyWhatsAppWebhook,
    require("./modules/whatsapp/whatsapp.controller").receiveMessage
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// Phase 4 (Testing & Session Hardening): must come after cookieParser
// (needs req.cookies) and before route handlers, but there's no need to
// place it after auth.middleware - it only inspects the raw cookie/header
// pair, it doesn't need req.user. See csrf.middleware.js for what this
// does and doesn't protect against.
app.use(require("./middleware/csrf.middleware"));
// Determines req.locale ("en" | "sw") for every request - from ?lang=,
// then Accept-Language, then default - so error messages, notifications,
// and emails render in the right language. auth.middleware refines this
// further for signed-in users using their saved language preference.
app.use(require("./middleware/locale.middleware"));
// General abuse safety net, not a per-user quota - see rateLimit.middleware.js.
// authLimiter (tighter) is applied directly on the auth/password-OTP routes.
app.use("/api/", apiLimiter);

// Debug route - gated behind admin auth so it can't be used to probe the
// database or leak connection errors to the public internet.
app.get("/db-test", authMiddleware, authorizeMiddleware("admin"), async (req, res) => {
    try {
        const [rows] = await db.query("SELECT NOW() AS currentTime");

        res.json({
            success: true,
            database: "Connected",
            time: rows[0].currentTime
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === "production"
                ? "Database connection failed"
                : error.message
        });
    }
});

// Public health check - safe to expose (no DB error details, no auth
// required). Use this as Render's "Health Check Path" for the backend
// service, and as a quick visual "is MySQL actually connected" check by
// just opening the URL in a browser.
app.get("/health", async (req, res) => {
    let dbConnected = false;

    try {
        await db.query("SELECT 1");
        dbConnected = true;
    } catch (error) {
        dbConnected = false;
    }

    const status = dbConnected ? "ok" : "degraded";
    const statusCode = dbConnected ? 200 : 503;

    // Browsers get a simple visual page; anything else (curl, Render's
    // health monitor, uptime tools) gets plain JSON.
    if (req.accepts(["html", "json"]) === "html") {
        res.status(statusCode).send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <title>NEXORA API Status</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style nonce="${res.locals.cspNonce}">
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #070912;
            font-family: -apple-system, Inter, system-ui, sans-serif;
            color: #F7F8FB;
        }
        .card {
            text-align: center;
            padding: 2.5rem 3rem;
            border-radius: 12px;
            background: #111623;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .dot {
            width: 12px;
            height: 12px;
            border-radius: 999px;
            display: inline-block;
            margin-right: 8px;
            background: ${dbConnected ? "#22c55e" : "#e4572e"};
            box-shadow: 0 0 12px ${dbConnected ? "#22c55e" : "#e4572e"};
        }
        h1 { font-size: 1.1rem; font-weight: 600; margin: 0 0 0.5rem; }
        p { color: rgba(247,248,251,0.5); font-size: 0.85rem; margin: 0.25rem 0 0; }
    </style>
</head>
<body>
    <div class="card">
        <h1><span class="dot"></span>NEXORA API is running</h1>
        <p>MySQL: ${dbConnected ? "Connected" : "Not connected"}</p>
        <p>${new Date().toISOString()}</p>
    </div>
</body>
</html>
        `);
        return;
    }

    res.status(statusCode).json({
        status,
        database: dbConnected ? "connected" : "disconnected",
        timestamp: new Date().toISOString()
    });
});

// Test Route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Welcome to NEXORA API 🚀"
    });
});

app.use("/api/v1/auth", authRoutes);
// Must be mounted BEFORE /api/v1/seller: it is a more specific prefix
// of that path, and Express falls through an unmatched router to the
// next app.use() rather than stopping - same reasoning (and same fix)
// as /api/v1/admin/account-verifications vs /api/v1/admin further
// below. Every route in this module already requires authorize("seller")
// + requireApprovedSeller itself (sponsorship.routes.js), so nothing
// here relies on sellerRoutes running first.
app.use("/api/v1/seller/sponsorship", sponsorshipRoutes);
// Same reasoning as the sponsorship mount immediately above: a more
// specific prefix of /api/v1/seller must be mounted first. Every route
// in this module already requires authorize("seller") +
// requireApprovedSeller itself (featuredStore.routes.js).
app.use("/api/v1/seller/featured-store", featuredStoreRoutes);
// Same reasoning as the two mounts immediately above: a more specific
// prefix of /api/v1/seller must be mounted first. Every route in this
// module already requires authorize("seller") + requireApprovedSeller
// itself (departmentSponsorship.routes.js).
app.use("/api/v1/seller/department-sponsorship", departmentSponsorshipRoutes);
app.use("/api/v1/seller", sellerRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/store-types", storeTypeRoutes);
// Nexora Services - Phase 1 (Foundation). Separate top-level namespaces
// from /categories and /products, matching CHANGES.md's own framing of
// Services as a parallel domain sharing infrastructure, not a variant of
// the product catalog.
app.use("/api/v1/service-categories", serviceCategoryRoutes);
app.use("/api/v1/services", serviceRoutes);
// Nexora Services - Phase 2 (Booking Infrastructure). Mounted at the
// same /services base as serviceRoutes above, not nested further -
// availabilityRoutes defines its own "/:serviceId/availability" paths,
// so this sits alongside serviceRoutes' own "/:id/images" etc. without
// colliding (Express only matches a route pattern to a request with the
// same number of path segments). Bookings gets its own top-level
// namespace since a booking's identity doesn't belong to the service
// the way an image or an availability date does - same reasoning
// order_items live under /orders, not nested under /products.
app.use("/api/v1/services", availabilityRoutes);
app.use("/api/v1/bookings", bookingRoutes);
app.use("/api/v1/stores", storeRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/delivery", deliveryRoutes);
app.use("/api/v1/reviews", reviewRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/push", pushRoutes);
app.use("/api/v1/settings", settingsRoutes);
// Must be mounted BEFORE /api/v1/admin: it's a more specific prefix of
// that path, and Express falls through an unmatched router to the next
// app.use() rather than stopping - so with the general /admin mount
// first, every /admin/account-verifications/* request would needlessly
// run adminRoutes' authMiddleware/authorize("admin") twice (once there,
// once again in accountVerificationRoutes), and any future literal
// route accidentally added to admin.routes.js matching this path would
// silently shadow this router entirely.
app.use("/api/v1/admin/account-verifications", accountVerificationRoutes);
app.use("/api/v1/admin/notifications", adminNotificationRoutes);
app.use("/api/v1/admin/maintenance", maintenanceRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/earnings", earningsRoutes);
app.use("/api/v1/account", accountRoutes);
app.use("/api/v1/wishlist", wishlistRoutes);
app.use("/api/v1/addresses", buyerAddressRoutes);
app.use("/api/v1/coupons", couponRoutes);
// Mounted at the bare /api/v1 prefix (not /api/v1/product-questions)
// because this router's own paths already spell out
// /products/:productId/questions and /questions/:id/answer - keeps the
// public API shape RESTful (questions nested under the product they
// belong to) without a redundant extra path segment.
app.use("/api/v1", productQuestionRoutes);
app.use("/api/v1", productVariantRoutes);
app.use("/api/v1", productAlertRoutes);
app.use("/api/v1/seller-filters", sellerSavedFilterRoutes);
app.use("/api/v1/disputes", disputeRoutes);
app.use("/api/v1/returns", returnRoutes);
app.use("/api/v1/kyc", kycRoutes);
// Deliberately NOT nested under "/api/v1/wallet" (the seller wallet
// module's mount) - that router's own auth/role middleware runs on
// every path under its prefix before Express falls through to the next
// matching router, which would reject a buyer before ever reaching this
// one. A sibling path avoids the collision entirely.
app.use("/api/v1/buyer-wallet", buyerWalletRoutes);
app.use("/api/v1/loans", loanRoutes);
app.use("/api/v1/support", supportRoutes);
app.use("/api/v1/whatsapp", whatsappRoutes);
// Roadmap Phase 1 (WhatsApp/SMS as an Offer-Accept Channel) - SMS
// fallback inbound webhook. See sms.routes.js's header comment for why
// this doesn't need the raw-body wiring the routes above it do.
app.use("/api/v1/sms", require("./modules/sms/sms.routes"));
app.use("/api/v1/efd", efdRoutes);
app.use("/api/v1/pickup-points", pickupPointRoutes);
app.use("/api/v1/content", contentRoutes);
app.use("/api/v1/loyalty", referralRoutes);
app.use("/api/v1/group-buys", groupBuyRoutes);
app.use("/api/v1/live-selling", liveSellingRoutes);
app.use("/api/v1/business", businessRoutes);
app.use("/api/v1/affiliate", affiliateRoutes);
app.use("/api/v1/subscriptions", subscriptionRoutes);
app.use("/api/v1/recommendations", recommendationRoutes);
app.use("/api/v1/status", statusRoutes);
// Nexora AI (Phase B1) - see modules/ai/ai.service.js's header comment
// for the safety/grounding rules every route here shares.
app.use("/api/v1/ai", aiRoutes);

app.get("/api/v1/me", authMiddleware, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// Reports unexpected (5xx-class) errors to Sentry - must be registered
// after all routes but before the app's own errorHandler below, per
// Sentry's own setup docs. shouldHandleError is overridden because the
// default only skips 4xx status codes that were set via
// `res.status()` before the error - most of this codebase throws a
// plain Error or an appError() with `.status` attached (see
// utils/appError.js and errorHandler.js), which the default wouldn't
// recognize. Expected client errors (validation, "not found", a
// rejected webhook signature, etc.) are noise here, not incidents -
// only genuine 5xx/unclassified errors are worth an alert.
Sentry.setupExpressErrorHandler(app, {
    shouldHandleError(error) {
        const status = error.status || error.statusCode;
        return !status || status >= 500;
    }
});

// errorHandler must be registered last, after all routes
app.use(errorHandler);

module.exports = app;