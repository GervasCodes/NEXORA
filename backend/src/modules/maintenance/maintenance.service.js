const maintenanceRepository = require("./maintenance.repository");
const categoryRepository = require("../category/category.repository");
const serviceCategoryRepository = require("../serviceCategory/serviceCategory.repository");

// Read on nearly every request that hits a maintenance-gated module
// (see middleware/maintenance.middleware.js), but only ever changes when
// an admin flips a toggle - same reasoning/shape as settings.service.js's
// cache. setActive() below invalidates it immediately so a toggle is live
// for the very next request, not up to CACHE_TTL_MS later.
const CACHE_TTL_MS = 15_000;
let cache = null;
let cacheExpiresAt = 0;

const getCachedModules = async () => {
    if (cache && Date.now() < cacheExpiresAt) {
        return cache;
    }
    const rows = await maintenanceRepository.findAll();
    const map = new Map(rows.map((row) => [row.module_key, row]));
    cache = map;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return cache;
};

const invalidateCache = () => {
    cache = null;
    cacheExpiresAt = 0;
};

// Used by maintenance.middleware.js. Fails "open" (module counts as
// active) for a module_key that isn't seeded in platform_modules at all,
// so a typo'd key or a module that hasn't been added to the table yet
// never accidentally blocks a route.
exports.getModuleStatus = async (moduleKey) => {
    const map = await getCachedModules();
    const row = map.get(moduleKey);
    if (!row) {
        return { isActive: true, message: null };
    }
    return { isActive: !!row.is_active, message: row.maintenance_message };
};

exports.listModules = async () => maintenanceRepository.findAll();

exports.setModuleActive = async (moduleKey, isActive, message, updatedBy) => {
    const existing = await maintenanceRepository.findByKey(moduleKey);
    if (!existing) {
        throw new Error("Unknown module");
    }
    await maintenanceRepository.setActive(moduleKey, isActive, message, updatedBy);
    invalidateCache();
};

// Unified feed for the Admin Panel's "Maintenance Management" section -
// departments and services already have their own admin list endpoints
// (GET /categories/admin/all, GET /service-categories/admin/all) with
// their own activate/deactivate routes; this just brings all three
// categories of toggle together in one response so the admin UI can
// render them as one section instead of three unrelated pages.
exports.getOverview = async () => {
    const [departments, services, modules] = await Promise.all([
        categoryRepository.findAllForAdmin(),
        serviceCategoryRepository.findAllForAdmin(),
        maintenanceRepository.findAll()
    ]);

    return {
        departments: departments.map((d) => ({
            id: d.id,
            type: "department",
            name: d.name,
            slug: d.slug,
            is_active: !!d.is_active,
            status: d.status,
            maintenance_message: d.maintenance_message,
            maintenance_scheduled_start: d.maintenance_scheduled_start,
            maintenance_scheduled_end: d.maintenance_scheduled_end
        })),
        services: services.map((s) => ({
            id: s.id,
            type: "service",
            name: s.name,
            slug: s.slug,
            is_active: !!s.is_active,
            status: s.status,
            maintenance_message: s.maintenance_message
        })),
        modules: modules.map((m) => ({
            id: m.id,
            type: "module",
            key: m.module_key,
            name: m.name,
            description: m.description,
            is_active: !!m.is_active,
            maintenance_message: m.maintenance_message
        }))
    };
};
