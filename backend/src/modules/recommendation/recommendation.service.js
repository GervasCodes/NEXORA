const recommendationRepository = require("./recommendation.repository");
const productRepository = require("../product/product.repository");

const DEFAULT_LIMIT = 12;

// Rules-based (not ML) "for you" feed:
//   1. Signed-in buyer with purchase history -> best sellers in their
//      top 3 purchased categories, excluding anything they've already
//      bought.
//   2. Anyone else (no history, or not signed in) -> platform-wide
//      trending (units sold, trailing 60 days).
// This is deliberately simple and fully explainable - every ranking
// factor here is a plain SQL aggregate, not a model - which matters for
// a small marketplace: it's auditable, needs no training data, and cold
// -starts correctly (a brand-new buyer or a brand-new catalog still gets
// a sensible, non-empty result via the trending fallback).
exports.getForBuyer = async (buyerId, limit = DEFAULT_LIMIT) => {
    if (!buyerId) {
        return recommendationRepository.findTrending([], limit);
    }

    const [topCategories, purchasedIds] = await Promise.all([
        recommendationRepository.findTopCategoriesForBuyer(buyerId, 3),
        recommendationRepository.findPurchasedProductIds(buyerId)
    ]);

    if (topCategories.length === 0) {
        return recommendationRepository.findTrending(purchasedIds, limit);
    }

    const categoryResults = await recommendationRepository.findPopularInCategories(topCategories, purchasedIds, limit);

    // A buyer with a narrow purchase history (e.g. only ever bought from
    // one small category) can get fewer than `limit` category matches -
    // top up with trending so the shelf never looks sparse.
    if (categoryResults.length < limit) {
        const alreadyShown = [...purchasedIds, ...categoryResults.map((p) => p.id)];
        const filler = await recommendationRepository.findTrending(alreadyShown, limit - categoryResults.length);
        return [...categoryResults, ...filler];
    }

    return categoryResults;
};

// "Related products" for a product detail page - same category, best
// sellers first. Falls back to trending (still excluding the product
// itself) if the product has no category or the category has nothing
// else in it, so the shelf is never empty.
exports.getRelatedToProduct = async (productSlugOrId, limit = 8) => {
    const product = typeof productSlugOrId === "number"
        ? await productRepository.findById(productSlugOrId)
        : await productRepository.findBySlug(productSlugOrId);

    if (!product) return [];

    const related = await recommendationRepository.findRelatedToProduct(product.id, product.category_id, limit);
    if (related.length >= limit) return related;

    const filler = await recommendationRepository.findTrending([product.id, ...related.map((p) => p.id)], limit - related.length);
    return [...related, ...filler];
};
