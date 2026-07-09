const storeTypeRepository = require("./storeType.repository");

const toSlug = (name) =>
    name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\w-]/g, "");

exports.listPublic = async () => {
    return storeTypeRepository.findAllActive();
};

exports.listForAdmin = async () => {
    return storeTypeRepository.findAllForAdmin();
};

exports.createStoreType = async (name) => {
    const slug = toSlug(name);

    const existing = await storeTypeRepository.findBySlug(slug);
    if (existing) {
        throw new Error("A store type with this name already exists");
    }

    const storeTypeId = await storeTypeRepository.create(name, slug);
    return { storeTypeId, slug };
};

exports.updateStoreType = async (id, name) => {
    const storeType = await storeTypeRepository.findById(id);
    if (!storeType) {
        throw new Error("Store type not found");
    }

    const slug = toSlug(name);
    const existing = await storeTypeRepository.findBySlug(slug);

    if (existing && existing.id !== Number(id)) {
        throw new Error("A store type with this name already exists");
    }

    await storeTypeRepository.update(id, name, slug);
};

exports.setStoreTypeActive = async (id, isActive) => {
    const storeType = await storeTypeRepository.findById(id);
    if (!storeType) {
        throw new Error("Store type not found");
    }

    await storeTypeRepository.setActive(id, isActive);
};
