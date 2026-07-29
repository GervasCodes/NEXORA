const serviceRepository = require("./service.repository");
const serviceCategoryRepository = require("../serviceCategory/serviceCategory.repository");
const { uploadToCloudinary } = require("../../utils/cloudinaryUpload");
const { parseSort } = require("../../utils/serviceSort");

// Same reasoning as product.service.js#assertCategoryIsActive - the
// dropdown that feeds this already excludes inactive categories, so this
// only bites a direct/stale API call, but it's the authoritative check.
const assertCategoryIsActive = async (categoryId) => {
    if (!categoryId) return;

    const category = await serviceCategoryRepository.findById(categoryId);
    if (!category || !category.is_active) {
        throw Object.assign(new Error("Selected service category is not available"), {
            code: "SERVICE_CATEGORY_UNAVAILABLE",
            status: 400
        });
    }
};

const toSlug = (title) =>
    title.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\w-]/g, "");

exports.createService = async (providerId, data) => {
    await assertCategoryIsActive(data.category_id);

    const slug = `${toSlug(data.title)}-${Date.now().toString(36)}`;

    const serviceId = await serviceRepository.create({
        provider_id: providerId,
        category_id: data.category_id || null,
        title: data.title,
        slug,
        description: data.description,
        pricing_model: data.pricing_model || "fixed",
        base_price: data.base_price,
        discount_price: data.discount_price,
        country: data.country,
        region: data.region,
        city: data.city,
        address: data.address,
        lat: data.lat,
        lng: data.lng
    });

    return { serviceId, slug };
};

exports.listServices = async (query) => {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 12));

    const minPrice = query.min_price !== undefined && query.min_price !== ""
        ? Number(query.min_price) : null;
    const maxPrice = query.max_price !== undefined && query.max_price !== ""
        ? Number(query.max_price) : null;

    const { rows, total } = await serviceRepository.findAll({
        categoryId: query.category_id || null,
        search: query.search || null,
        minPrice,
        maxPrice,
        city: query.city || null,
        sort: parseSort(query.sort),
        page,
        limit
    });

    return {
        services: rows,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit))
        }
    };
};

exports.getServiceBySlug = async (slug) => {
    const service = await serviceRepository.findBySlug(slug);

    if (!service) {
        throw new Error("Service not found");
    }

    const media = await serviceRepository.findMediaByServiceId(service.id);

    return { ...service, media };
};

// Per-listing media cap for videos only, same reasoning and limit as
// product.service.js#MAX_VIDEOS_PER_PRODUCT - images stay uncapped.
const MAX_VIDEOS_PER_SERVICE = 3;

exports.addMedia = async (providerId, serviceId, file, mediaType, isPrimary) => {
    const service = await serviceRepository.findById(serviceId);

    if (!service || service.provider_id !== providerId) {
        throw new Error("Service not found");
    }

    const existingCount = await serviceRepository.countExistingMedia(serviceId);

    if (mediaType === "video") {
        const existing = await serviceRepository.findMediaByServiceId(serviceId);
        const existingVideos = existing.filter((row) => row.media_type === "video").length;

        if (existingVideos >= MAX_VIDEOS_PER_SERVICE) {
            throw new Error(`A service can have at most ${MAX_VIDEOS_PER_SERVICE} videos`);
        }
    }

    const folder = mediaType === "video" ? "services/videos" : "services/media";
    const resourceType = mediaType === "video" ? "video" : "image";
    const result = await uploadToCloudinary(file.buffer, folder, resourceType);

    // First media item uploaded for a service is automatically the
    // primary one, same as product.service.js#addProductImage.
    const primary = existingCount === 0 ? true : Boolean(isPrimary);

    await serviceRepository.addMedia(serviceId, result.secure_url, mediaType, primary, existingCount);

    return { mediaUrl: result.secure_url, mediaType, isPrimary: primary };
};

exports.getMyServices = async (providerId) => {
    return serviceRepository.findAllByProvider(providerId);
};

exports.getMyServiceById = async (providerId, serviceId) => {
    const service = await serviceRepository.findById(serviceId);

    if (!service || service.provider_id !== providerId) {
        throw new Error("Service not found");
    }

    const media = await serviceRepository.findMediaByServiceId(serviceId);

    return { ...service, media };
};

exports.updateService = async (providerId, serviceId, data) => {
    const service = await serviceRepository.findById(serviceId);

    if (!service || service.provider_id !== providerId) {
        throw new Error("Service not found");
    }

    if (data.category_id) {
        await assertCategoryIsActive(data.category_id);
    }

    await serviceRepository.update(serviceId, data);

    return serviceRepository.findById(serviceId);
};

// A provider can move their own listing between draft and published at
// will. Suspending a listing (policy violation etc.) is an admin action
// only - handled separately, not exposed here, same split
// migration 062's header describes between `status` and `is_active`.
exports.publishService = async (providerId, serviceId) => {
    const service = await serviceRepository.findById(serviceId);

    if (!service || service.provider_id !== providerId) {
        throw new Error("Service not found");
    }

    const media = await serviceRepository.countExistingMedia(serviceId);
    if (media === 0) {
        throw new Error("Add at least one photo before publishing a service");
    }

    await serviceRepository.setStatus(serviceId, "published");
};

exports.unpublishService = async (providerId, serviceId) => {
    const service = await serviceRepository.findById(serviceId);

    if (!service || service.provider_id !== providerId) {
        throw new Error("Service not found");
    }

    await serviceRepository.setStatus(serviceId, "draft");
};

exports.setServiceActiveByProvider = async (providerId, serviceId, isActive) => {
    const service = await serviceRepository.findById(serviceId);

    if (!service || service.provider_id !== providerId) {
        throw new Error("Service not found");
    }

    await serviceRepository.setActive(serviceId, isActive);
};
