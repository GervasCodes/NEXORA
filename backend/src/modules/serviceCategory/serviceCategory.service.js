const serviceCategoryRepository = require("./serviceCategory.repository");
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");

const toSlug = (name) =>
    name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\w-]/g, "");

exports.listPublic = async () => {
    return serviceCategoryRepository.findAllActive();
};

exports.listForAdmin = async () => {
    return serviceCategoryRepository.findAllForAdmin();
};

// Public category grid (the services-marketplace equivalent of
// categoryService.listDepartments, without the sponsorship/trending/recent
// sections product departments have - those land in Phase 4/5 of the
// services roadmap once there's booking activity to rank by). For now
// this just adds a live listing count per category.
exports.listWithCounts = async () => {
    const categories = await serviceCategoryRepository.findAllActive();

    return Promise.all(
        categories.map(async (category) => ({
            ...category,
            serviceCount: await serviceCategoryRepository.countServicesByCategory(category.id)
        }))
    );
};

exports.getBySlug = async (slug) => {
    const category = await serviceCategoryRepository.findBySlug(slug);
    if (!category) {
        return null;
    }

    // Same Active/Maintenance/Deactivated distinction as
    // category.service.js#getDepartmentBySlug - see that comment.
    if (category.status === "deactivated") {
        return null;
    }

    if (category.status === "maintenance") {
        const error = new Error(
            category.maintenance_message || `${category.name} is temporarily unavailable for maintenance.`
        );
        error.isMaintenance = true;
        error.categoryName = category.name;
        throw error;
    }

    const serviceCount = await serviceCategoryRepository.countServicesByCategory(category.id);
    return { ...category, serviceCount };
};

exports.createCategory = async (name, description, displayOrder) => {
    const slug = toSlug(name);

    const existing = await serviceCategoryRepository.findBySlug(slug);
    if (existing) {
        throw new Error("A service category with this name already exists");
    }

    const categoryId = await serviceCategoryRepository.create(name, slug, description, displayOrder);
    return { categoryId, slug };
};

exports.updateCategory = async (id, name, description, displayOrder) => {
    const category = await serviceCategoryRepository.findById(id);
    if (!category) {
        throw new Error("Service category not found");
    }

    const slug = toSlug(name);
    const existing = await serviceCategoryRepository.findBySlug(slug);

    if (existing && existing.id !== Number(id)) {
        throw new Error("A service category with this name already exists");
    }

    const nextDisplayOrder = displayOrder === undefined ? category.display_order : displayOrder;
    await serviceCategoryRepository.update(id, name, slug, description, nextDisplayOrder);
};

exports.uploadCoverImage = async (id, file) => {
    const category = await serviceCategoryRepository.findById(id);
    if (!category) {
        throw new Error("Service category not found");
    }

    const result = await uploadToCloudinary(file.buffer, "service-categories/covers");
    await serviceCategoryRepository.updateCoverImage(id, result.secure_url);
    return result.secure_url;
};

exports.setCategoryActive = async (id, isActive, maintenanceMessage) => {
    const category = await serviceCategoryRepository.findById(id);
    if (!category) {
        throw new Error("Service category not found");
    }

    await serviceCategoryRepository.setActive(id, isActive, maintenanceMessage);
};

// True deactivation - distinct from setCategoryActive(id, false, ...)
// above, which only puts a category into maintenance.
exports.deactivateCategory = async (id) => {
    const category = await serviceCategoryRepository.findById(id);
    if (!category) {
        throw new Error("Service category not found");
    }

    await serviceCategoryRepository.setDeactivated(id);
};
