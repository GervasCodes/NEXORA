const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const helmet = require("helmet");

const db = require("./config/db");
const { apiLimiter } = require("./middleware/rateLimit.middleware");

const authRoutes = require("./modules/auth/auth.routes");
const authMiddleware = require("./middleware/auth.middleware");
const sellerRoutes = require("./modules/seller/seller.routes");
const productRoutes = require("./modules/product/product.routes");
const categoryRoutes = require("./modules/category/category.routes");
const storeTypeRoutes = require("./modules/storeType/storeType.routes");
const cartRoutes = require("./modules/cart/cart.routes");
const orderRoutes = require("./modules/order/order.routes");
const paymentRoutes = require("./modules/payment/payment.routes");
const deliveryRoutes = require("./modules/delivery/delivery.routes");
const reviewRoutes = require("./modules/review/review.routes");
const notificationRoutes = require("./modules/notification/notification.routes");
const chatRoutes = require("./modules/chat/chat.routes");
const pushRoutes = require("./modules/push/push.routes");
const adminRoutes = require("./modules/admin/admin.routes");
const walletRoutes = require("./modules/wallet/wallet.routes");
const earningsRoutes = require("./modules/earnings/earnings.routes");
const accountRoutes = require("./modules/account/account.routes");
const wishlistRoutes = require("./modules/wishlist/wishlist.routes");
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
// Sets X-Content-Type-Options, X-Frame-Options, HSTS, and friends.
// contentSecurityPolicy is off: this is a JSON API (the frontend is a
// separate deployed app), and the one HTML page it does serve (/health)
// uses an inline <style> block that a default CSP would block for no
// real security benefit here.
app.use(helmet({ contentSecurityPolicy: false }));
// Gzips every JSON/HTML response over the wire - product listings and
// admin tables in particular shrink dramatically, at negligible CPU cost.
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
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
    <style>
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
app.use("/api/v1/seller", sellerRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/store-types", storeTypeRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/delivery", deliveryRoutes);
app.use("/api/v1/reviews", reviewRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/push", pushRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/earnings", earningsRoutes);
app.use("/api/v1/account", accountRoutes);
app.use("/api/v1/wishlist", wishlistRoutes);

app.get("/api/v1/me", authMiddleware, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// errorHandler must be registered last, after all routes
app.use(errorHandler);

module.exports = app;