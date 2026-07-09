const webpush = require("web-push");

// Same philosophy as mobileMoney.provider.js: if the VAPID keys aren't set
// yet, push just quietly no-ops instead of crashing the app. Generate a
// pair with `npx web-push generate-vapid-keys` and put them in .env.
const isConfigured = Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
);

if (isConfigured) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || "mailto:admin@example.com",
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

exports.isConfigured = isConfigured;
exports.webpush = webpush;
