const productVariantRepository = require("./productVariant.repository");
const productRepository = require("../product/product.repository");

// Deterministic, sorted string form of a variant's option combination
// ({"Size":"M","Color":"Red"} -> "Color:Red|Size:M") - see migration
// 095's comment on why this exists (MySQL can't uniquely constrain JSON
// content directly).
const computeOptionsKey = (options) =>
    Object.keys(options)
        .sort()
        .map((key) => `${key}:${options[key]}`)
        .join("|");

exports.getForProduct = async (productId) => {
    const options = await productVariantRepository.findOptionsByProduct(productId);
    const variants = (await productVariantRepository.findVariantsByProduct(productId))
        .filter((v) => v.is_active);
    return { options, variants };
};

// Replaces a product's entire variant configuration in one call - see
// productVariant.repository.js#replaceVariants for why "replace
// everything, matched by combination" is simpler and safer here than
// incremental per-row CRUD endpoints (a seller's variant builder UI
// naturally submits "here is my current full matrix", not a sequence
// of individual row edits).
exports.replaceForProduct = async (sellerId, productId, rawOptions, rawVariants) => {
    const product = await productRepository.findById(productId);
    if (!product || product.seller_id !== sellerId) {
        throw new Error("Product not found");
    }

    const options = (rawOptions || []).map((opt, i) => ({
        name: String(opt.name || "").trim(),
        display_order: i,
        values: (opt.values || []).map((v) => String(v).trim()).filter(Boolean)
    })).filter((opt) => opt.name && opt.values.length > 0);

    if (options.length === 0) {
        // Clearing all options is how a seller turns variants back off
        // for a product - handled identically to "replace with an empty
        // set" below (has_variants goes back to 0, existing variant rows
        // are deactivated rather than deleted, for the same order-history
        // reason given in the repository layer).
        await productVariantRepository.replaceVariants(productId, [], []);
        return exports.getForProduct(productId);
    }

    const validValuesByOption = new Map(options.map((o) => [o.name, new Set(o.values)]));
    const optionNames = options.map((o) => o.name);

    const seenKeys = new Set();
    const variants = [];

    for (const rawVariant of rawVariants || []) {
        const combo = rawVariant.options || {};

        // Every variant must specify exactly the product's current set
        // of option axes, each with a value that's actually one of that
        // axis's defined values - otherwise a stray/typo'd combination
        // could silently become unselectable (an axis missing) or
        // unreachable (a value the buyer-facing selector never offers).
        const comboKeys = Object.keys(combo);
        const hasAllAxes = optionNames.every((name) => comboKeys.includes(name)) && comboKeys.length === optionNames.length;
        const valuesValid = comboKeys.every((name) => validValuesByOption.get(name)?.has(combo[name]));

        if (!hasAllAxes || !valuesValid) {
            throw new Error(`Invalid option combination: ${JSON.stringify(combo)}`);
        }

        const optionsKey = computeOptionsKey(combo);
        if (seenKeys.has(optionsKey)) {
            throw new Error(`Duplicate variant combination: ${JSON.stringify(combo)}`);
        }
        seenKeys.add(optionsKey);

        variants.push({
            options: combo,
            optionsKey,
            sku: rawVariant.sku,
            price_delta: Number(rawVariant.price_delta) || 0,
            stock: Math.max(0, Number(rawVariant.stock) || 0),
            image_url: rawVariant.image_url
        });
    }

    await productVariantRepository.replaceVariants(productId, options, variants);
    return exports.getForProduct(productId);
};

exports.computeOptionsKey = computeOptionsKey;
