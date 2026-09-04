const productQuestionService = require("./productQuestion.service");

exports.list = async (req, res) => {
    try {
        const page = Number(req.query.page) || 1;
        const result = await productQuestionService.listForProduct(req.params.productId, { page, limit: 10 });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.ask = async (req, res) => {
    try {
        const question = await productQuestionService.ask(req.params.productId, req.user.id, req.body.question);
        res.status(201).json({ success: true, message: "Question posted.", data: question });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.answer = async (req, res) => {
    try {
        const question = await productQuestionService.answer(req.user.id, req.params.id, req.body.answer);
        res.json({ success: true, message: "Answer posted.", data: question });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
