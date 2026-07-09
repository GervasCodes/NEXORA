const categoryRepository = require("./category.repository");

const toSlug = (name) =>
    name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\w-]/g, "");

exports.listPublic = async () => {
    return categoryRepository.findAllActive();
};

exports.listForAdmin = async () => {
    return categoryRepository.findAllForAdmin();
};

exports.createCategory = async (name, description) => {
    const slug = toSlug(name);

    const existing = await categoryRepository.findBySlug(slug);
    if (existing) {
        throw new Error("A category with this name already exists");
    }

    const categoryId = await categoryRepository.create(name, slug, description);
    return { categoryId, slug };
};

exports.updateCategory = async (id, name, description) => {
    const category = await categoryRepository.findById(id);
    if (!category) {
        throw new Error("Category not found");
    }

    const slug = toSlug(name);
    const existing = await categoryRepository.findBySlug(slug);

    if (existing && existing.id !== Number(id)) {
        throw new Error("A category with this name already exists");
    }

    await categoryRepository.update(id, name, slug, description);
};

exports.setCategoryActive = async (id, isActive) => {
    const category = await categoryRepository.findById(id);
    if (!category) {
        throw new Error("Category not found");
    }

    await categoryRepository.setActive(id, isActive);
};
