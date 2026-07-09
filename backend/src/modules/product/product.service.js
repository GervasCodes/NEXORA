const productRepository = require("./product.repository");
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");

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

    const { rows, total } = await productRepository.findAll({
        categoryId: query.category_id || null,
        search: query.search || null,
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

exports.getProductBySlug = async (slug) => {
    const product = await productRepository.findBySlug(slug);

    if (!product) {
        throw new Error("Product not found");
    }

    const images = await productRepository.findImagesByProductId(product.id);

    return { ...product, images };
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

exports.getMyProducts = async (sellerId) => {
    return productRepository.findAllBySeller(sellerId);
};

exports.getMyProductById = async (sellerId, productId) => {
    const product = await productRepository.findById(productId);

    if (!product || product.seller_id !== sellerId) {
        throw new Error("Product not found");
    }

    const images = await productRepository.findImagesByProductId(productId);

    return { ...product, images };
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