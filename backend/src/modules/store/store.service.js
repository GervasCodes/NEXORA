const storeRepository = require("./store.repository");

exports.getPublicStoreProfile = async (slug) => {
    const store = await storeRepository.findPublicBySlug(slug);

    if (!store) {
        throw new Error("Store not found.");
    }

    return store;
};

// Phase 7C - Seller Collections. No "store not found" check here (unlike
// getPublicStoreProfile above): an unknown slug simply matches nothing in
// the JOIN and returns an empty array, which is exactly what a store with
// no collections yet should also return - the two cases don't need to be
// told apart, since the store page only renders this data when it already
// has a valid store profile loaded from the call above.
exports.getStoreCollections = async (slug) => {
    return storeRepository.findCollectionsBySlug(slug);
};

exports.search = async (query) => {
    const search = (query.search || "").trim();
    if (!search) return [];
    const limit = Math.min(20, Math.max(1, parseInt(query.limit) || 5));
    return storeRepository.search({ search, limit });
};

// Store follows (Phase 6, UI/UX remediation). Resolves the store's
// slug to its owning seller's user_id first (same lookup
// getStoreProfile already does) so the follow relationship is keyed on
// the same identifier as everything else in this file, not a second
// "store id" concept.
const resolveStoreUserId = async (slug) => {
    const store = await storeRepository.findPublicBySlug(slug);
    if (!store) {
        throw new Error("Store not found");
    }
    return store.user_id;
};

exports.follow = async (followerId, slug) => {
    const storeUserId = await resolveStoreUserId(slug);
    if (storeUserId === followerId) {
        throw new Error("You can't follow your own store");
    }
    await storeRepository.follow(followerId, storeUserId);
};

exports.unfollow = async (followerId, slug) => {
    const storeUserId = await resolveStoreUserId(slug);
    await storeRepository.unfollow(followerId, storeUserId);
};

exports.getFollowStatus = async (followerId, slug) => {
    const storeUserId = await resolveStoreUserId(slug);
    const [following, followerCount] = await Promise.all([
        storeRepository.isFollowing(followerId, storeUserId),
        storeRepository.countFollowers(storeUserId)
    ]);
    return { following, followerCount };
};

// Called from product.service.js#createProduct right after a new
// listing goes live - fire-and-forget (never awaited by the caller),
// same reasoning as every other "notify someone" call elsewhere in this
// codebase. Fans out through the existing notificationService pipeline
// (DB row + socket + push, depending on that service's own withEmail/
// withPush handling) per follower, rather than a separate broadcast
// mechanism.
exports.notifyFollowersOfNewListing = async (storeUserId, product) => {
    const followerIds = await storeRepository.findFollowerIds(storeUserId);
    if (!followerIds.length) return;

    const notificationService = require("../notification/notification.service");
    await Promise.all(followerIds.map((followerId) =>
        notificationService.notify({
            userId: followerId,
            type: "store_new_listing",
            title: "New listing",
            message: `A store you follow just listed "${product.name}".`,
            url: `/products/${product.slug}`
        }).catch(() => {})
    ));
};
