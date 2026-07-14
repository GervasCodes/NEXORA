const wishlistRepository = require("./wishlist.repository");
const productRepository = require("../product/product.repository");

exports.add = async (userId, productId) => {
    const product = await productRepository.findById(productId);
    if (!product) {
        throw new Error("Product not found");
    }
    await wishlistRepository.add(userId, productId);
};

exports.remove = async (userId, productId) => {
    await wishlistRepository.remove(userId, productId);
};

exports.getIds = async (userId) => wishlistRepository.findProductIdsByUser(userId);

exports.getSaved = async (userId) => wishlistRepository.findByUser(userId);
