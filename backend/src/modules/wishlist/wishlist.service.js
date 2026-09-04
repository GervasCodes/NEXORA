const wishlistRepository = require("./wishlist.repository");
const productRepository = require("../product/product.repository");
const serviceRepository = require("../service/service.repository");

exports.addProduct = async (userId, productId) => {
    const product = await productRepository.findById(productId);
    if (!product) {
        throw new Error("Product not found");
    }
    await wishlistRepository.add(userId, { productId });
};

exports.removeProduct = async (userId, productId) => {
    await wishlistRepository.remove(userId, { productId });
};

// Phase 5 (UI/UX remediation) - service wishlist parity with products.
exports.addService = async (userId, serviceId) => {
    const service = await serviceRepository.findById(serviceId);
    if (!service) {
        throw new Error("Service not found");
    }
    await wishlistRepository.add(userId, { serviceId });
};

exports.removeService = async (userId, serviceId) => {
    await wishlistRepository.remove(userId, { serviceId });
};

exports.getIds = async (userId) => wishlistRepository.findIdsByUser(userId);

exports.getSavedProducts = async (userId) => wishlistRepository.findProductsByUser(userId);
exports.getSavedServices = async (userId) => wishlistRepository.findServicesByUser(userId);
