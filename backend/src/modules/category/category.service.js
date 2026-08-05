const categoryRepository = require("./category.repository");
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");
const socket = require("../../socket/socket");

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
    if (!category) {
        return null;
    }

    // A truly deactivated department must disappear completely - same as
    // if the row didn't exist at all. No maintenance page, not even
    // reachable by direct link.
    if (category.status === "deactivated") {
        return null;
    }

    // A department in maintenance is a different case from "doesn't
    // exist": the frontend shows a maintenance page instead of a 404 for
    // this one, and the page is still reachable by direct link. See
    // category.controller.js#getDepartment.
    if (category.status === "maintenance") {
        const error = new Error(
            category.maintenance_message || `${category.name} is temporarily unavailable for maintenance.`
        );
        error.isMaintenance = true;
        error.departmentName = category.name;
        error.estimatedReturn = category.maintenance_scheduled_end || null;
        throw error;
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

// Toast/in-app alert broadcast for the department the shopper-facing app
// listens for (frontend/src/components/DepartmentMaintenanceListener.jsx
// and DepartmentPage.jsx). Fires on every transition regardless of
// whether it was a manual admin click or an automated schedule tick
// (jobs/departmentMaintenanceSchedule.job.js), so shoppers get the same
// live notice either way.
const notifyMaintenanceChange = (category, status, message) => {
    socket.emitToAll("department:maintenance", {
        categoryId: category.id,
        slug: category.slug,
        name: category.name,
        status, // "entered" | "exited"
        message: message || null
    });
};

exports.setCategoryActive = async (id, isActive, maintenanceMessage) => {
    const category = await categoryRepository.findById(id);
    if (!category) {
        throw new Error("Category not found");
    }

    await categoryRepository.setActive(id, isActive, maintenanceMessage);
    notifyMaintenanceChange(category, isActive ? "exited" : "entered", isActive ? null : maintenanceMessage);
};

// True deactivation - distinct from setCategoryActive(id, false, ...)
// above, which only puts a department into maintenance. A deactivated
// department is hidden completely (see getDepartmentBySlug), so shoppers
// currently on its page need to be routed away rather than shown a
// maintenance screen - reuse the same "department:maintenance" socket
// event shoppers already listen for with a distinct status so
// DepartmentPage.jsx can tell the two apart.
exports.deactivateDepartment = async (id) => {
    const category = await categoryRepository.findById(id);
    if (!category) {
        throw new Error("Category not found");
    }

    await categoryRepository.setDeactivated(id);

    socket.emitToAll("department:maintenance", {
        categoryId: category.id,
        slug: category.slug,
        name: category.name,
        status: "deactivated",
        message: null
    });
};

// Schedules (or immediately applies, if startAt has already arrived) a
// maintenance window for a department. See
// category.repository.js#scheduleMaintenance for the "starts now" rule.
exports.scheduleMaintenance = async (id, startAt, endAt, message) => {
    const category = await categoryRepository.findById(id);
    if (!category) {
        throw new Error("Category not found");
    }
    if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
        throw new Error("End time must be after start time");
    }

    const startedNow = await categoryRepository.scheduleMaintenance(id, startAt, endAt, message);
    if (startedNow) {
        notifyMaintenanceChange(category, "entered", message);
    }
    return { startedNow };
};

exports.cancelScheduledMaintenance = async (id) => {
    const category = await categoryRepository.findById(id);
    if (!category) {
        throw new Error("Category not found");
    }

    await categoryRepository.cancelScheduledMaintenance(id);
};

// Called by the cron job - applies every due transition and broadcasts
// each one exactly like a manual toggle would.
exports.applyDueMaintenanceSchedules = async () => {
    const [dueToEnter, dueToExit] = await Promise.all([
        categoryRepository.findDueToEnterMaintenance(),
        categoryRepository.findDueToExitMaintenance()
    ]);

    for (const category of dueToEnter) {
        await categoryRepository.applyScheduledEntry(category.id);
        notifyMaintenanceChange(category, "entered", category.maintenance_message);
    }

    for (const category of dueToExit) {
        await categoryRepository.applyScheduledExit(category.id);
        notifyMaintenanceChange(category, "exited", null);
    }

    return dueToEnter.length + dueToExit.length;
};
