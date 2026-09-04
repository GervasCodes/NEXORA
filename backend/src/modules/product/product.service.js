const productRepository = require("./product.repository");
const categoryRepository = require("../category/category.repository");
const productVariantService = require("../productVariant/productVariant.service");
const productAlertService = require("../productAlert/productAlert.service");
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");
const { parsePriceRange, parseSellerId, parseLocation, parseMinRating } = require("../../utils/productFilters");
const { parseSort } = require("../../utils/productSort");
const cache = require("../../utils/cache");

// Phase RF5: namespace for cached browse/search reads below (listProducts
// + the two filter-dropdown endpoints). Deliberately excludes
// getProductBySlug (the product-detail page) - that's the page a shopper
// is on right before adding to cart, and its stock figure is closer to
// "live inventory" than a browse listing's is, so it stays on a direct DB
// read per the Phase RF5 plan.
const CACHE_NAMESPACE = "products";

// A separate namespace this module bumps into, not owns - product
// visibility changes (a new product going live, or an existing one being
// activated/deactivated) change what category.service.js's cached
// listDepartments/getDepartmentBySlug show (productCount, trending,
// recent), so those need invalidating too. Calling cache.bumpVersion
// directly here (instead of importing category.service.js) avoids a
// circular require - product.service.js already depends on
// category.repository.js directly for the same reason.
const CATEGORY_CACHE_NAMESPACE = "categories";

// Guards createProduct/updateProduct against a category_id for a disabled
// department (e.g. Services - see migration 055). The dropdown that feeds
// this (SellerProductForm.jsx -> GET /categories) already excludes
// inactive categories, so this only bites a direct/stale API call - but
// it's the authoritative check, not the UI hiding the option.
const assertCategoryIsActive = async (categoryId) => {
    const category = await categoryRepository.findById(categoryId);
    if (!category || !category.is_active) {
        throw Object.assign(new Error("Selected category is not available"), {
            code: "CATEGORY_UNAVAILABLE",
            status: 400
        });
    }
};

exports.createProduct = async (sellerId, data) => {
    await assertCategoryIsActive(data.category_id);

    // Revenue & Product Enhancements roadmap: a seller's subscription
    // plan caps how many active listings (products + services combined)
    // they can have - see subscription.service.js#canCreateListing. The
    // Free plan's own seeded limit (20) applies if the seller has never
    // subscribed to anything.
    const subscriptionService = require("../subscription/subscription.service");
    const listingCheck = await subscriptionService.canCreateListing(sellerId);
    if (!listingCheck.allowed) {
        throw Object.assign(new Error(listingCheck.message), {
            code: "LISTING_LIMIT_REACHED",
            status: 403
        });
    }

    const slug = data.name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]/g, "");

    const productId = await productRepository.create({
        seller_id: sellerId,
        category_id: data.category_id,
        name: data.name,
        slug,
        description: data.description,
        price: data.price,
        discount_price: data.discount_price,
        stock: data.stock || 0,
        brand: data.brand,
        product_condition: data.product_condition || "new"
    });

    // New products change the browse/search result set and the owning
    // department's productCount/trending/recent - bump both namespaces.
    await Promise.all([
        cache.bumpVersion(CACHE_NAMESPACE),
        cache.bumpVersion(CATEGORY_CACHE_NAMESPACE)
    ]);

    // Follow-store notifications (Phase 6, UI/UX remediation) -
    // fire-and-forget, deliberately not awaited (same reasoning as
    // every other "notify someone" call in this codebase).
    const storeService = require("../store/store.service");
    storeService.notifyFollowersOfNewListing(sellerId, { name: data.name, slug }).catch(() => {});

    return {
        productId,
        slug
    };
};

exports.listProducts = async (query) => {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 12));
    const { min, max } = parsePriceRange(query.min_price, query.max_price);

    const filters = {
        categoryId: query.category_id || null,
        search: query.search || null,
        minPrice: min,
        maxPrice: max,
        sellerId: parseSellerId(query.seller_id),
        region: parseLocation(query.region),
        minRating: parseMinRating(query.min_rating),
        sort: parseSort(query.sort),
        page,
        limit
    };

    const { rows, total } = await cache.getOrSet(
        CACHE_NAMESPACE,
        { fn: "listProducts", ...filters },
        () => productRepository.findAll(filters)
    );

    return {
        products: rows,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit))
        }
    };
};

// Filter-dropdown data (Phase 3A): every seller with at least one active
// product, optionally narrowed to a single category/department.
exports.listFilterSellers = async (query) => {
    const categoryId = query.category_id || null;
    return cache.getOrSet(
        CACHE_NAMESPACE,
        { fn: "listFilterSellers", categoryId },
        () => productRepository.findFilterSellers({ categoryId })
    );
};

// Filter-dropdown data (Phase 3B): every region with at least one active
// product, optionally narrowed to a single category/department.
exports.listFilterRegions = async (query) => {
    const categoryId = query.category_id || null;
    return cache.getOrSet(
        CACHE_NAMESPACE,
        { fn: "listFilterRegions", categoryId },
        () => productRepository.findFilterRegions({ categoryId })
    );
};

exports.getProductBySlug = async (slug) => {
    const product = await productRepository.findBySlug(slug);

    if (!product) {
        throw new Error("Product not found");
    }

    // Images, videos (Phase 6A), and audio (Phase 6B) all load together
    // since the product-detail page needs all three on first render.
    const [images, videos, audio] = await Promise.all([
        productRepository.findImagesByProductId(product.id),
        productRepository.findVideosByProductId(product.id),
        productRepository.findAudioByProductId(product.id)
    ]);

    // Variants (Phase 2, UI/UX remediation) - only queried for products
    // that actually have them (has_variants flag, see migration 095),
    // so the common single-SKU product page doesn't pay for three extra
    // empty-result queries.
    const variantData = product.has_variants
        ? await productVariantService.getForProduct(product.id)
        : { options: [], variants: [] };

    return { ...product, images, videos, audio, ...variantData };
};

exports.addProductImage = async (sellerId, productId, file, isPrimary) => {
    const product = await productRepository.findById(productId);

    if (!product || product.seller_id !== sellerId) {
        throw new Error("Product not found");
    }

    const existingCount = await productRepository.countExistingImages(productId);

    const result = await uploadToCloudinary(file.buffer, "products");

    // First image uploaded for a product is automatically the primary one
    const primary = existingCount === 0 ? true : Boolean(isPrimary);

    const imageId = await productRepository.addProductImage(
        productId,
        result.secure_url,
        primary,
        existingCount
    );

    return { id: imageId, imageUrl: result.secure_url, isPrimary: primary };
};

// Ownership check shared by delete/set-primary/reorder below - throws the
// same "Product not found" a mismatched/foreign product_id would give,
// rather than leaking whether the id exists under a different seller.
const assertOwnsProduct = async (sellerId, productId) => {
    const product = await productRepository.findById(productId);
    if (!product || product.seller_id !== sellerId) {
        throw new Error("Product not found");
    }
    return product;
};

exports.deleteProductImage = async (sellerId, productId, imageId) => {
    await assertOwnsProduct(sellerId, productId);

    const image = await productRepository.findImageById(productId, imageId);
    if (!image) {
        throw new Error("Photo not found");
    }

    await productRepository.deleteProductImage(productId, imageId);

    // Deleting the primary photo would otherwise leave the product with
    // no primary image at all (browse cards / product-detail hero both
    // expect exactly one, when any exist) - promote whichever remains
    // first in display order.
    if (image.is_primary) {
        await productRepository.promoteEarliestImageToPrimary(productId);
    }

    await cache.bumpVersion(CACHE_NAMESPACE);
};

exports.setPrimaryImage = async (sellerId, productId, imageId) => {
    await assertOwnsProduct(sellerId, productId);

    const image = await productRepository.findImageById(productId, imageId);
    if (!image) {
        throw new Error("Photo not found");
    }

    await productRepository.setPrimaryImage(productId, imageId);
    await cache.bumpVersion(CACHE_NAMESPACE);
};

// `orderedIds` reflects the seller's desired top-to-bottom order; each id
// is only re-numbered if it actually belongs to this product (the
// `AND product_id = ?` in the UPDATE), so a stray/foreign id in the array
// is silently ignored rather than able to touch another product's rows.
exports.reorderProductImages = async (sellerId, productId, orderedIds) => {
    await assertOwnsProduct(sellerId, productId);
    await productRepository.reorderProductImages(productId, orderedIds);
    await cache.bumpVersion(CACHE_NAMESPACE);
};

// Phase 6A - Product Videos. Same ownership check as addProductImage,
// plus a small per-product cap (unlike photos, which have no cap) -
// video is the most storage/bandwidth-expensive media type a seller can
// upload here, so a hard ceiling keeps one listing from growing an
// unbounded video library.
const MAX_VIDEOS_PER_PRODUCT = 3;

exports.addProductVideo = async (sellerId, productId, file) => {
    const product = await productRepository.findById(productId);

    if (!product || product.seller_id !== sellerId) {
        throw new Error("Product not found");
    }

    const existingCount = await productRepository.countExistingVideos(productId);

    if (existingCount >= MAX_VIDEOS_PER_PRODUCT) {
        throw new Error(`A product can have at most ${MAX_VIDEOS_PER_PRODUCT} videos`);
    }

    const result = await uploadToCloudinary(file.buffer, "products/videos", "video");

    const videoId = await productRepository.addProductVideo(productId, result.secure_url, existingCount);

    return { id: videoId, videoUrl: result.secure_url };
};

exports.deleteProductVideo = async (sellerId, productId, videoId) => {
    await assertOwnsProduct(sellerId, productId);
    const deleted = await productRepository.deleteProductVideo(productId, videoId);
    if (!deleted) {
        throw new Error("Video not found");
    }
};

exports.reorderProductVideos = async (sellerId, productId, orderedIds) => {
    await assertOwnsProduct(sellerId, productId);
    await productRepository.reorderProductVideos(productId, orderedIds);
};

// Phase 6B - Product Audio. Same ownership check and per-product cap
// pattern as addProductVideo. Cloudinary has no separate "audio"
// resource type of its own - audio files are uploaded as resourceType
// "video" too (Cloudinary's own docs: audio is handled by the same
// video pipeline), so this reuses uploadToCloudinary exactly as-is.
const MAX_AUDIO_PER_PRODUCT = 3;

exports.addProductAudio = async (sellerId, productId, file) => {
    const product = await productRepository.findById(productId);

    if (!product || product.seller_id !== sellerId) {
        throw new Error("Product not found");
    }

    const existingCount = await productRepository.countExistingAudio(productId);

    if (existingCount >= MAX_AUDIO_PER_PRODUCT) {
        throw new Error(`A product can have at most ${MAX_AUDIO_PER_PRODUCT} audio clips`);
    }

    const result = await uploadToCloudinary(file.buffer, "products/audio", "video");

    const audioId = await productRepository.addProductAudio(productId, result.secure_url, existingCount);

    return { id: audioId, audioUrl: result.secure_url };
};

exports.deleteProductAudio = async (sellerId, productId, audioId) => {
    await assertOwnsProduct(sellerId, productId);
    const deleted = await productRepository.deleteProductAudio(productId, audioId);
    if (!deleted) {
        throw new Error("Audio clip not found");
    }
};

exports.reorderProductAudio = async (sellerId, productId, orderedIds) => {
    await assertOwnsProduct(sellerId, productId);
    await productRepository.reorderProductAudio(productId, orderedIds);
};

exports.getMyProducts = async (sellerId, query = {}) => {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 20));

    const { rows, total } = await productRepository.findAllBySeller({
        sellerId,
        search: query.search || null,
        categoryId: query.category_id || null,
        status: query.status || null,
        page,
        limit
    });

    return {
        products: rows,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    };
};

// Bulk counterpart of setProductActiveBySeller below - ownership is
// enforced in the repository's UPDATE itself (seller_id in the WHERE
// clause), not by loading and checking each row first.
exports.bulkSetProductActiveBySeller = async (sellerId, productIds, isActive) => {
    const ids = [...new Set((productIds || []).map(Number))].filter((id) => Number.isInteger(id) && id > 0);

    if (!ids.length) {
        throw new Error("No products selected");
    }

    await productRepository.setActiveBulkBySeller(sellerId, ids, isActive);

    await Promise.all([
        cache.bumpVersion(CACHE_NAMESPACE),
        cache.bumpVersion(CATEGORY_CACHE_NAMESPACE)
    ]);

    return { updated: ids.length };
};

// Phase 11 (UI/UX remediation) - bulk price adjustment, same
// ids-dedup-and-validate shape as bulkSetProductActiveBySeller above.
exports.bulkAdjustPriceBySeller = async (sellerId, productIds, adjustType, adjustValue) => {
    const ids = [...new Set((productIds || []).map(Number))].filter((id) => Number.isInteger(id) && id > 0);

    if (!ids.length) {
        throw new Error("No products selected");
    }
    if (!["percent", "flat"].includes(adjustType)) {
        throw new Error("Invalid adjustment type");
    }
    const value = Number(adjustValue);
    if (!Number.isFinite(value) || value === 0) {
        throw new Error("Enter a non-zero adjustment");
    }

    await productRepository.adjustPriceBulkBySeller(sellerId, ids, adjustType, value);

    await Promise.all([
        cache.bumpVersion(CACHE_NAMESPACE),
        cache.bumpVersion(CATEGORY_CACHE_NAMESPACE)
    ]);

    return { updated: ids.length };
};

exports.getMyProductById = async (sellerId, productId) => {
    const product = await productRepository.findById(productId);

    if (!product || product.seller_id !== sellerId) {
        throw new Error("Product not found");
    }

    const [images, videos, audio] = await Promise.all([
        productRepository.findImagesByProductId(productId),
        productRepository.findVideosByProductId(productId),
        productRepository.findAudioByProductId(productId)
    ]);

    return { ...product, images, videos, audio };
};

exports.updateProduct = async (sellerId, productId, data) => {
    const product = await productRepository.findById(productId);

    if (!product || product.seller_id !== sellerId) {
        throw new Error("Product not found");
    }

    if (data.category_id) {
        await assertCategoryIsActive(data.category_id);
    }

    await productRepository.update(productId, data);

    const cacheBumps = [cache.bumpVersion(CACHE_NAMESPACE)];
    // Only bump the categories namespace when the edit could actually
    // change a department's cached counts/trending/recent lists - a
    // category move changes two departments' membership; a name/price/
    // description-only edit doesn't change any department's product
    // count and is a small enough drift for the department cards' own
    // 30-60s TTL to absorb.
    if (data.category_id && data.category_id !== product.category_id) {
        cacheBumps.push(cache.bumpVersion(CATEGORY_CACHE_NAMESPACE));
    }
    await Promise.all(cacheBumps);

    const updated = await productRepository.findById(productId);

    // Back-in-stock / price-drop alerts (Phase 5, UI/UX remediation) -
    // fire-and-forget, deliberately not awaited (same reasoning as
    // every other "notify someone" call in this codebase - see
    // productAlert.service.js's own comment). Compares this edit's old
    // vs new values, not just the new value, so these only fire on an
    // actual 0->positive stock transition or a genuine price decrease,
    // never re-fire on an unrelated edit of an already-in-stock/
    // already-cheap product.
    productAlertService.checkAndNotifyStockChange(updated, Number(product.stock)).catch(() => {});
    productAlertService.checkAndNotifyPriceChange(
        updated,
        Number(product.discount_price ?? product.price)
    ).catch(() => {});

    return updated;
};

exports.setProductActiveBySeller = async (sellerId, productId, isActive) => {
    const product = await productRepository.findById(productId);

    if (!product || product.seller_id !== sellerId) {
        throw new Error("Product not found");
    }

    await productRepository.setActive(productId, isActive);

    // Activating/deactivating changes both the browse/search result set
    // and the owning department's live productCount/trending/recent.
    await Promise.all([
        cache.bumpVersion(CACHE_NAMESPACE),
        cache.bumpVersion(CATEGORY_CACHE_NAMESPACE)
    ]);
};