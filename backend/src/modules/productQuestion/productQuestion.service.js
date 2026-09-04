const productQuestionRepository = require("./productQuestion.repository");
const productRepository = require("../product/product.repository");
const notificationService = require("../notification/notification.service");

exports.listForProduct = async (productId, pagination) =>
    productQuestionRepository.findByProduct(productId, pagination);

exports.ask = async (productId, userId, question) => {
    const product = await productRepository.findById(productId);
    if (!product) {
        throw new Error("Product not found");
    }

    const id = await productQuestionRepository.create(productId, userId, question);

    // Fire-and-forget, same reasoning as the rest of this codebase's
    // "notify the other side something happened" calls elsewhere (see
    // review.service.js#replyToReview) - a notification failing should
    // never fail the question itself.
    notificationService.notify({
        userId: product.seller_id,
        type: "product_question",
        title: "New question on your listing",
        message: `Someone asked a question about "${product.name}".`,
        url: `/products/${product.slug}`
    }).catch(() => {});

    return productQuestionRepository.findById(id);
};

// Mirrors review.service.js#replyToReview's ownership check exactly -
// a seller may only answer a question on one of their own products,
// verified through products.seller_id rather than a duplicated column
// on product_questions.
exports.answer = async (sellerId, questionId, answerText) => {
    const question = await productQuestionRepository.findById(questionId);
    if (!question) {
        throw new Error("Question not found");
    }

    const product = await productRepository.findById(question.product_id);
    if (!product || product.seller_id !== sellerId) {
        throw new Error("Question not found");
    }

    await productQuestionRepository.setAnswer(questionId, answerText);

    notificationService.notify({
        userId: question.user_id,
        type: "product_question_answered",
        title: "Your question was answered",
        message: `The seller answered your question about "${product.name}".`,
        url: `/products/${product.slug}`
    }).catch(() => {});

    return productQuestionRepository.findById(questionId);
};
