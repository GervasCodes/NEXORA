const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const db = require("./config/db");

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
const errorHandler = require("./middleware/errorHandler");

const authorizeMiddleware = require("./middleware/authorize.middleware");

const app = express();

// Middlewares
// CORS_ORIGIN can be a single origin or a comma-separated list. Falls back
// to "*" only if unset, which is fine for local dev but should always be
// set explicitly in production (see backend/.env.example).
const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
    : "*";
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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

app.get("/api/v1/me", authMiddleware, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// errorHandler must be registered last, after all routes
app.use(errorHandler);

module.exports = app;