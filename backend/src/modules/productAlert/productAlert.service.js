const productAlertRepository = require("./productAlert.repository");
const productRepository = require("../product/product.repository");
const notificationService = require("../notification/notification.service");

exports.subscribeBackInStock = async (userId, productId) => {
    const product = await productRepository.findById(productId);
    if (!product) {
        throw new Error("Product not found");
    }
    if (Number(product.stock) > 0) {
        throw new Error("This product is already in stock");
    }
    await productAlertRepository.subscribe(userId, productId, "back_in_stock");
};

exports.subscribePriceDrop = async (userId, productId) => {
    const product = await productRepository.findById(productId);
    if (!product) {
        throw new Error("Product not found");
    }
    // Baseline is the price at the moment they opted in - they're
    // notified once the price drops below whatever they were looking
    // at, not below some other reference point.
    const currentPrice = Number(product.discount_price ?? product.price);
    await productAlertRepository.subscribe(userId, productId, "price_drop", currentPrice);
};

exports.unsubscribe = async (userId, productId, alertType) => {
    await productAlertRepository.unsubscribe(userId, productId, alertType);
};

exports.getSubscriptions = async (userId, productId) =>
    productAlertRepository.findSubscriptions(userId, productId);

// Called from product.service.js#updateProduct right after a seller's
// edit lands - fire-and-forget (never awaited by the caller), matching
// every other "notify someone something happened" call elsewhere in
// this codebase (e.g. review.service.js#replyToReview,
// productQuestion.service.js#ask). Compares old vs new stock/price
// rather than just looking at the new value, since "went from 0 to 5"
// is the back-in-stock trigger, not "is currently > 0" (which would
// re-fire on every subsequent edit of an already-in-stock product).
exports.checkAndNotifyStockChange = async (product, previousStock) => {
    const newStock = Number(product.stock);
    if (previousStock > 0 || newStock <= 0) {
        return; // not a 0 -> positive transition
    }

    const pending = await productAlertRepository.findPendingForProduct(product.id, "back_in_stock");
    if (!pending.length) return;

    await Promise.all(pending.map((sub) =>
        notificationService.notify({
            userId: sub.user_id,
            type: "product_back_in_stock",
            title: "Back in stock",
            message: `"${product.name}" is back in stock.`,
            url: `/products/${product.slug}`
        }).catch(() => {})
    ));

    await productAlertRepository.markNotified(pending.map((sub) => sub.id));
};

exports.checkAndNotifyPriceChange = async (product, previousEffectivePrice) => {
    const newEffectivePrice = Number(product.discount_price ?? product.price);
    if (newEffectivePrice >= previousEffectivePrice) {
        return;
    }

    const pending = await productAlertRepository.findPendingForProduct(product.id, "price_drop");
    const eligible = pending.filter((sub) => newEffectivePrice < Number(sub.price_baseline));
    if (!eligible.length) return;

    await Promise.all(eligible.map((sub) =>
        notificationService.notify({
            userId: sub.user_id,
            type: "product_price_drop",
            title: "Price drop",
            message: `"${product.name}" just got cheaper.`,
            url: `/products/${product.slug}`
        }).catch(() => {})
    ));

    await productAlertRepository.markNotified(eligible.map((sub) => sub.id));
};
