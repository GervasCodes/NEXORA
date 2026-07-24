const categoryRepository = require("./category.repository");
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");

const toSlug = (name) =>
    name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\w-]/g, "");

// How many trending products to preview on a department card.
const TRENDING_PREVIEW_LIMIT = 3;
// How many recent products to return per department (data layer for
// Phase 2B's "recently added products" feed).
const RECENT_PREVIEW_LIMIT = 6;
// Window for the "N new this week" card indicator.
const NEW_WINDOW_DAYS = 7;
// Row length for the department page's promotions/sponsored sections.
const SECTION_LIMIT = 6;
// How many stores to feature on a department page.
const FEATURED_STORES_LIMIT = 4;

exports.listPublic = async () => {
    return categoryRepository.findAllActive();
};

exports.listForAdmin = async () => {
    return categoryRepository.findAllForAdmin();
};

// Homepage department cards: each active category plus its live product
// count, a trending-products preview, recent products, and a "new this
// week" count. N+1 by design - there are only a handful of departments,
// so a few extra queries per card is simpler and clearer than one large
// aggregate query.
//
// Phase 8C (Department Sponsorship) is what pulls in
// findAllActiveWithSponsorship instead of findAllActive here: a
// currently-active department_sponsorship_campaigns row for a category
// bumps it to the front of this list and sets `is_sponsored` on the
// response, which DepartmentCard.jsx uses to show a "Sponsored" badge.
// See that function's comment in category.repository.js for why this is
// a separate query from the plain findAllActive the `GET /categories`
// dropdown endpoint still uses.
exports.listDepartments = async () => {
    const categories = await categoryRepository.findAllActiveWithSponsorship();

    return Promise.all(
        categories.map(async (category) => {
            const [productCount, trending, recent, newCount] = await Promise.all([
                categoryRepository.countProductsByCategory(category.id),
                categoryRepository.findTrendingByCategory(category.id, TRENDING_PREVIEW_LIMIT),
                categoryRepository.findRecentByCategory(category.id, RECENT_PREVIEW_LIMIT),
                categoryRepository.countRecentByCategory(category.id, NEW_WINDOW_DAYS)
            ]);

            return { ...category, productCount, trending, recent, newCount };
        })
    );
};

// Single-department lookup for the department page - covers, count,
// trending/recent (same as the homepage card) plus the Phase 2C sections
// (promotions, sponsored, featured stores) that only make sense once
// you're already looking at one department, not fanned out across all 7.
exports.getDepartmentBySlug = async (slug) => {
    const category = await categoryRepository.findBySlug(slug);
    if (!category || !category.is_active) {
        return null;
    }

    const [productCount, trending, recent, newCount, promotions, sponsored, featuredStores] = await Promise.all([
        categoryRepository.countProductsByCategory(category.id),
        categoryRepository.findTrendingByCategory(category.id, TRENDING_PREVIEW_LIMIT),
        categoryRepository.findRecentByCategory(category.id, RECENT_PREVIEW_LIMIT),
        categoryRepository.countRecentByCategory(category.id, NEW_WINDOW_DAYS),
        categoryRepository.findPromotionsByCategory(category.id, SECTION_LIMIT),
        categoryRepository.findSponsoredByCategory(category.id, SECTION_LIMIT),
        categoryRepository.findFeaturedStoresByCategory(category.id, FEATURED_STORES_LIMIT)
    ]);

    return { ...category, productCount, trending, recent, newCount, promotions, sponsored, featuredStores };
};

exports.createCategory = async (name, description, displayOrder) => {
    const slug = toSlug(name);

    const existing = await categoryRepository.findBySlug(slug);
    if (existing) {
        throw new Error("A category with this name already exists");
    }

    const categoryId = await categoryRepository.create(name, slug, description, displayOrder);
    return { categoryId, slug };
};

exports.updateCategory = async (id, name, description, displayOrder) => {
    const category = await categoryRepository.findById(id);
    if (!category) {
        throw new Error("Category not found");
    }

    const slug = toSlug(name);
    const existing = await categoryRepository.findBySlug(slug);

    if (existing && existing.id !== Number(id)) {
        throw new Error("A category with this name already exists");
    }

    const nextDisplayOrder = displayOrder === undefined ? category.display_order : displayOrder;
    await categoryRepository.update(id, name, slug, description, nextDisplayOrder);
};

exports.uploadCoverImage = async (id, file) => {
    const category = await categoryRepository.findById(id);
    if (!category) {
        throw new Error("Category not found");
    }

    const result = await uploadToCloudinary(file.buffer, "categories/covers");
    await categoryRepository.updateCoverImage(id, result.secure_url);
    return result.secure_url;
};

exports.setCategoryActive = async (id, isActive) => {
    const category = await categoryRepository.findById(id);
    if (!category) {
        throw new Error("Category not found");
    }

    await categoryRepository.setActive(id, isActive);
};
