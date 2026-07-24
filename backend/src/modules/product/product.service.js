const productRepository = require("./product.repository");
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");
const { parsePriceRange, parseSellerId, parseLocation, parseMinRating } = require("../../utils/productFilters");
const { parseSort } = require("../../utils/productSort");

exports.createProduct = async (sellerId, data) => {

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

    return {
        productId,
        slug
    };
};

exports.listProducts = async (query) => {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 12));
    const { min, max } = parsePriceRange(query.min_price, query.max_price);

    const { rows, total } = await productRepository.findAll({
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
    });

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
    return productRepository.findFilterSellers({
        categoryId: query.category_id || null
    });
};

// Filter-dropdown data (Phase 3B): every region with at least one active
// product, optionally narrowed to a single category/department.
exports.listFilterRegions = async (query) => {
    return productRepository.findFilterRegions({
        categoryId: query.category_id || null
    });
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

    return { ...product, images, videos, audio };
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

    await productRepository.addProductImage(
        productId,
        result.secure_url,
        primary,
        existingCount
    );

    return { imageUrl: result.secure_url, isPrimary: primary };
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

    await productRepository.addProductVideo(productId, result.secure_url, existingCount);

    return { videoUrl: result.secure_url };
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

    await productRepository.addProductAudio(productId, result.secure_url, existingCount);

    return { audioUrl: result.secure_url };
};

exports.getMyProducts = async (sellerId) => {
    return productRepository.findAllBySeller(sellerId);
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

    await productRepository.update(productId, data);

    return productRepository.findById(productId);
};

exports.setProductActiveBySeller = async (sellerId, productId, isActive) => {
    const product = await productRepository.findById(productId);

    if (!product || product.seller_id !== sellerId) {
        throw new Error("Product not found");
    }

    await productRepository.setActive(productId, isActive);
};