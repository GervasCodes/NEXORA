const sellerSavedFilterRepository = require("./sellerSavedFilter.repository");

// Restricted to a known set of page keys rather than accepting any
// string - keeps this from silently becoming a general-purpose
// key/value store for anything a client feels like naming.
const ALLOWED_PAGE_KEYS = ["seller_products", "seller_orders"];

const assertPageKey = (pageKey) => {
    if (!ALLOWED_PAGE_KEYS.includes(pageKey)) {
        throw new Error("Invalid page");
    }
};

exports.list = async (sellerId, pageKey) => {
    assertPageKey(pageKey);
    return sellerSavedFilterRepository.findByPage(sellerId, pageKey);
};

exports.create = async (sellerId, pageKey, name, filters) => {
    assertPageKey(pageKey);
    const trimmedName = (name || "").trim();
    if (!trimmedName) {
        throw new Error("Name is required");
    }
    const id = await sellerSavedFilterRepository.create(sellerId, pageKey, trimmedName, filters || {});
    return { id, name: trimmedName, filters: filters || {} };
};

exports.remove = async (sellerId, id) => {
    const affectedRows = await sellerSavedFilterRepository.remove(sellerId, id);
    if (!affectedRows) {
        throw new Error("Saved filter not found");
    }
};
