const db = require("../../config/db");
const posRepository = require("./pos.repository");
const settingsService = require("../settings/settings.service");
const stockLedger = require("../stock/stock.ledger");
const productAlertService = require("../productAlert/productAlert.service");
const { todayInTz, addDaysInTz } = require("../../utils/dateTz");

// Seller POS (Phase 7): manual stock movements + off-platform sales.
//
// Concurrency model: every stock change runs in one transaction that
// row-locks the product (and the variant, when there is one) BEFORE
// reading the current stock, so two simultaneous sales/adjustments, or a
// sale racing a platform checkout (which updates the same rows), are
// serialized and can never drive stock negative or lose an update.
// Lock order is always product -> variant.
//
// Idempotency: callers may pass an idempotency_key (the form generates
// one per submit). A repeat of the same key returns the original result
// without touching stock again - re-checked inside the transaction after
// the lock, with the unique index as the final backstop.

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

const fail = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const formatVariantLabel = (options) => {
    if (!options) return null;
    let parsed = options;
    if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch (_) { return parsed; }
    }
    if (Array.isArray(parsed)) {
        return parsed.map((o) => (o && typeof o === "object" ? (o.value ?? o.name) : o)).filter(Boolean).join(" / ") || null;
    }
    if (typeof parsed === "object") {
        return Object.values(parsed).filter(Boolean).join(" / ") || null;
    }
    return String(parsed);
};

// Locks and returns { product, variant, item, stockBefore, ... } for the requested
// target, enforcing that variant products are always addressed by variant. The
// stock ledger decides where the live number is (product, variant, or the
// external item a tools-only product was migrated to - migration 157).
const lockTarget = async (connection, sellerId, productId, variantId) => {
    const target = await stockLedger.lockByProduct(connection, sellerId, productId, variantId, { createdBy: sellerId });
    target.stockBefore = target.stock;
    return target;
};

const norm = (v) => (v === undefined || v === null || v === "" ? null : String(v));

// A repeated key with a different body is refused instead of replayed.
const assertSameRequest = (existing, payloadHash) => {
    if (existing && existing.payload_hash && existing.payload_hash !== payloadHash) {
        throw fail("This request id was already used for a different change. Reload and try again.", 409);
    }
};

// Back-in-stock alerts are product-level (0 -> positive), so they only
// apply to products without variants - same as the product edit path.
// Best-effort and post-commit: a notification failure must never undo a
// stock change that already committed.
const fireBackInStock = (target, stockBefore, stockAfter) => {
    if (target.variant) return;
    productAlertService
        .checkAndNotifyStockChange(
            { id: target.product.id, name: target.product.name, slug: target.product.slug, stock: stockAfter },
            stockBefore
        )
        .catch(() => {});
};

const isDuplicateKeyError = (error) => error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062);

const withTransaction = async (work) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const replayResult = async (sellerId, existing) => {
    const sale = existing.offline_sale_id
        ? await posRepository.findOfflineSaleById(sellerId, existing.offline_sale_id)
        : null;
    return { adjustment: existing, sale, replayed: true };
};

// Restock (add units) or correction (set the counted quantity).
exports.adjustStock = async (sellerId, input) => {
    const { productId, variantId, type, reason, idempotencyKey } = input;

    if (!["restock", "correction"].includes(type)) {
        throw fail("Invalid adjustment type.");
    }

    try {
        const outcome = await withTransaction(async (connection) => {
            const target = await lockTarget(connection, sellerId, productId, variantId);

            const payloadHash = stockLedger.hashPayload({
                kind: "adjust", productId, variantId: variantId || null, type,
                quantity: norm(input.quantity), newStock: norm(input.newStock)
            });
            if (idempotencyKey) {
                const existing = await posRepository.findAdjustmentByKey(sellerId, idempotencyKey, connection);
                if (existing) {
                    assertSameRequest(existing, payloadHash);
                    return { existing };
                }
            }

            const { stockBefore } = target;
            let stockAfter;

            if (type === "restock") {
                const quantity = Number(input.quantity);
                if (!Number.isInteger(quantity) || quantity <= 0) {
                    throw fail("Restock quantity must be a whole number greater than zero.");
                }
                stockAfter = stockBefore + quantity;
            } else {
                const newStock = Number(input.newStock);
                if (!Number.isInteger(newStock) || newStock < 0) {
                    throw fail("Counted stock must be a whole number, zero or more.");
                }
                if (newStock === stockBefore) {
                    throw fail("Counted stock matches the current stock - nothing to correct.");
                }
                stockAfter = newStock;
            }

            await stockLedger.applyDelta(connection, target, stockAfter - stockBefore, {
                type: type === "restock" ? "purchase" : "correction",
                reason, idempotencyKey, payloadHash,
                refType: "pos_adjustment", createdBy: sellerId
            });

            const adjustmentId = await posRepository.insertAdjustment(connection, {
                sellerId,
                productId: target.product.id,
                variantId: target.variant ? target.variant.id : null,
                type,
                quantityChange: stockAfter - stockBefore,
                stockBefore,
                stockAfter,
                reason,
                idempotencyKey,
                payloadHash
            });

            const adjustment = await posRepository.findAdjustmentById(adjustmentId, connection);
            return { adjustment, target, stockBefore, stockAfter };
        });

        if (outcome.existing) {
            return replayResult(sellerId, outcome.existing);
        }

        fireBackInStock(outcome.target, outcome.stockBefore, outcome.stockAfter);
        return { adjustment: outcome.adjustment, sale: null, replayed: false };
    } catch (error) {
        if (isDuplicateKeyError(error) && idempotencyKey) {
            const existing = await posRepository.findAdjustmentByKey(sellerId, idempotencyKey);
            if (existing) return replayResult(sellerId, existing);
        }
        throw error;
    }
};

// A sale that happened outside Nexora checkout: deducts stock, records
// the sale, and writes the matching ledger row - all or nothing.
exports.recordSale = async (sellerId, input) => {
    const { productId, variantId, paymentMethod, customerName, note, idempotencyKey } = input;
    const quantity = Number(input.quantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw fail("Quantity must be a whole number greater than zero.");
    }

    let soldAt = new Date();
    if (input.soldAt) {
        soldAt = new Date(input.soldAt);
        if (Number.isNaN(soldAt.getTime())) {
            throw fail("Invalid sale date.");
        }
        if (soldAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
            throw fail("Sale date can't be in the future.");
        }
    }

    try {
        const outcome = await withTransaction(async (connection) => {
            const target = await lockTarget(connection, sellerId, productId, variantId);

            const payloadHash = stockLedger.hashPayload({
                kind: "sale", productId, variantId: variantId || null, quantity,
                unitPrice: norm(input.unitPrice), paymentMethod: paymentMethod || "cash",
                customerName: norm(customerName), note: norm(note), soldAt: norm(input.soldAt)
            });
            if (idempotencyKey) {
                const existing = await posRepository.findAdjustmentByKey(sellerId, idempotencyKey, connection);
                if (existing) {
                    assertSameRequest(existing, payloadHash);
                    return { existing };
                }
            }

            const { product, variant, stockBefore } = target;

            if (stockBefore < quantity) {
                throw fail(`Not enough stock - only ${stockBefore} in stock.`);
            }

            const defaultPrice = Number(product.discount_price ?? product.price)
                + (variant ? Number(variant.price_delta) : 0);
            const unitPrice = input.unitPrice === undefined || input.unitPrice === null || input.unitPrice === ""
                ? defaultPrice
                : Number(input.unitPrice);
            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                throw fail("Unit price must be zero or more.");
            }
            const roundedUnitPrice = Math.round(unitPrice * 100) / 100;
            const totalAmount = Math.round(roundedUnitPrice * quantity * 100) / 100;

            const stockAfter = stockBefore - quantity;

            const saleId = await posRepository.insertOfflineSale(connection, {
                sellerId,
                productId: product.id,
                variantId: variant ? variant.id : null,
                productName: product.name,
                variantLabel: variant ? formatVariantLabel(variant.options) : null,
                quantity,
                unitPrice: roundedUnitPrice,
                totalAmount,
                paymentMethod: paymentMethod || "cash",
                customerName,
                note,
                soldAt
            });

            await stockLedger.applyDelta(connection, target, -quantity, {
                type: "sale", reason: `Off-platform sale #${saleId}`,
                idempotencyKey, payloadHash, refType: "offline_sale", refId: saleId, createdBy: sellerId
            });

            const adjustmentId = await posRepository.insertAdjustment(connection, {
                sellerId,
                productId: product.id,
                variantId: variant ? variant.id : null,
                type: "offline_sale",
                quantityChange: -quantity,
                stockBefore,
                stockAfter,
                reason: `Off-platform sale #${saleId}`,
                offlineSaleId: saleId,
                idempotencyKey,
                payloadHash
            });

            return {
                adjustment: await posRepository.findAdjustmentById(adjustmentId, connection),
                sale: await posRepository.findOfflineSaleById(sellerId, saleId, connection)
            };
        });

        if (outcome.existing) {
            return replayResult(sellerId, outcome.existing);
        }
        return { adjustment: outcome.adjustment, sale: outcome.sale, replayed: false };
    } catch (error) {
        if (isDuplicateKeyError(error) && idempotencyKey) {
            const existing = await posRepository.findAdjustmentByKey(sellerId, idempotencyKey);
            if (existing) return replayResult(sellerId, existing);
        }
        throw error;
    }
};

const pageParams = (query) => {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    return { limit, page, offset: (page - 1) * limit };
};

exports.listAdjustments = async (sellerId, query) => {
    const { limit, page, offset } = pageParams(query);
    const { rows, total } = await posRepository.listAdjustments(sellerId, {
        productId: query.product_id ? Number(query.product_id) : null,
        type: query.type || null,
        limit,
        offset
    });
    return { items: rows, total, page, limit };
};

exports.listSales = async (sellerId, query) => {
    const { limit, page, offset } = pageParams(query);
    const { rows, total, revenue } = await posRepository.listOfflineSales(sellerId, {
        productId: query.product_id ? Number(query.product_id) : null,
        from: query.from || null,
        to: query.to || null,
        limit,
        offset
    });
    return { items: rows, total, total_revenue: revenue, page, limit };
};

// ---------------------------------------------------------------------
// Phase 8 - read models
// ---------------------------------------------------------------------

// null = use each item's own reorder level (Phase 6); a number is an explicit override.
const lowStockThreshold = (query) => {
    const parsed = parseInt(query.threshold, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, 100000) : null;
};

exports.getStockLevels = async (sellerId, query) => {
    const { limit, page, offset } = pageParams(query);
    const threshold = lowStockThreshold(query);
    const search = (query.q || "").trim().slice(0, 100);
    const lowOnly = query.low_stock === "1" || query.low_stock === "true";

    const defaultLevel = await settingsService.getStockDefaultReorderLevel();
    const [{ rows, total }, summary] = await Promise.all([
        posRepository.listStockLevels(sellerId, { search, lowOnly, threshold, defaultLevel, limit, offset }),
        posRepository.getStockSummary(sellerId, threshold, defaultLevel)
    ]);

    const variantRows = await posRepository.findActiveVariantsForProducts(
        rows.filter((r) => r.has_variants).map((r) => r.id)
    );

    const items = rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        image_url: row.image_url,
        is_active: !!row.is_active,
        has_variants: !!row.has_variants,
        price: Number(row.discount_price ?? row.price),
        stock: Number(row.stock_total),
        variants: variantRows
            .filter((v) => v.product_id === row.id)
            .map((v) => ({
                id: v.id,
                label: formatVariantLabel(v.options),
                sku: v.sku,
                price_delta: Number(v.price_delta),
                stock: Number(v.stock)
            }))
    }));

    return {
        items,
        total,
        page,
        limit,
        threshold: threshold === null ? defaultLevel : threshold,
        summary: {
            products: Number(summary.products),
            low_stock: Number(summary.low_stock),
            out_of_stock: Number(summary.out_of_stock)
        }
    };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REPORT_DAYS = 366;

const toDateString = (date) => date.toISOString().slice(0, 10);

// Phase 8: the range is whole Africa/Dar_es_Salaam calendar days. The default "last 30 days
// ending today" used the UTC date (the previous day for three hours after local midnight), and
// the SQL compared the dates in the database's own zone. `from` / `to` stay "YYYY-MM-DD" text
// in the response; `start` / `endExclusive` are the UTC instants the queries compare against.
const resolveReportRange = (query) => {
    const to = query.to || todayInTz();
    const from = query.from || addDaysInTz(-29, new Date(`${to}T12:00:00+03:00`));

    const fromMs = new Date(`${from}T00:00:00+03:00`).getTime();
    const toMs = new Date(`${to}T00:00:00+03:00`).getTime();
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
        throw fail("Invalid date range.");
    }
    if (toMs < fromMs) {
        throw fail("The end date must be on or after the start date.");
    }
    if (Math.round((toMs - fromMs) / DAY_MS) + 1 > MAX_REPORT_DAYS) {
        throw fail("Choose a range of one year or less.");
    }
    return { from, to, start: new Date(fromMs), endExclusive: new Date(toMs + DAY_MS) };
};
exports.resolveReportRange = resolveReportRange;

// Combined on-platform (Nexora orders) + off-platform (manual sales)
// report. Money is revenue as recorded: order-item subtotals for
// platform sales, the recorded total for off-platform sales.
exports.getReport = async (sellerId, query) => {
    const range = resolveReportRange(query);
    const { from, to } = range;

    const [onTotals, offTotals, onDaily, offDaily, onProducts, offProducts] = await Promise.all([
        posRepository.onPlatformTotals(sellerId, range),
        posRepository.offlineTotals(sellerId, range),
        posRepository.onPlatformDaily(sellerId, range),
        posRepository.offlineDaily(sellerId, range),
        posRepository.onPlatformByProduct(sellerId, range),
        posRepository.offlineByProduct(sellerId, range)
    ]);

    const summarize = (row) => ({
        sales_count: Number(row.sales_count),
        units: Number(row.units),
        revenue: Number(row.revenue)
    });
    const on = summarize(onTotals);
    const off = summarize(offTotals);

    // Every day in the range, zero-filled, so a chart has no gaps.
    const dailyMap = new Map();
    for (let ms = new Date(`${from}T00:00:00Z`).getTime(); ms <= new Date(`${to}T00:00:00Z`).getTime(); ms += DAY_MS) {
        dailyMap.set(toDateString(new Date(ms)), { day: toDateString(new Date(ms)), on_platform: 0, off_platform: 0 });
    }
    onDaily.forEach((r) => { if (dailyMap.has(r.day)) dailyMap.get(r.day).on_platform = Number(r.revenue); });
    offDaily.forEach((r) => { if (dailyMap.has(r.day)) dailyMap.get(r.day).off_platform = Number(r.revenue); });

    const productMap = new Map();
    const entryFor = (productId) => {
        if (!productMap.has(productId)) {
            productMap.set(productId, {
                product_id: productId, name: null,
                on_platform_units: 0, on_platform_revenue: 0,
                off_platform_units: 0, off_platform_revenue: 0
            });
        }
        return productMap.get(productId);
    };
    onProducts.forEach((r) => {
        const e = entryFor(r.product_id);
        e.on_platform_units = Number(r.units);
        e.on_platform_revenue = Number(r.revenue);
    });
    offProducts.forEach((r) => {
        const e = entryFor(r.product_id);
        e.name = r.product_name;
        e.off_platform_units = Number(r.units);
        e.off_platform_revenue = Number(r.revenue);
    });

    const topIds = [...productMap.values()]
        .sort((a, b) =>
            (b.on_platform_revenue + b.off_platform_revenue) - (a.on_platform_revenue + a.off_platform_revenue))
        .slice(0, 20);
    const names = await posRepository.findProductNames(topIds.filter((e) => !e.name).map((e) => e.product_id));
    const nameById = new Map(names.map((n) => [n.id, n.name]));
    const by_product = topIds.map((e) => ({ ...e, name: e.name || nameById.get(e.product_id) || "-" }));

    return {
        from,
        to,
        on_platform: on,
        off_platform: off,
        combined: {
            sales_count: on.sales_count + off.sales_count,
            units: on.units + off.units,
            revenue: on.revenue + off.revenue
        },
        daily: [...dailyMap.values()],
        by_product
    };
};

// ---------------------------------------------------------------------
// Phase 10 - inventory items for business-tools-only accounts
// ---------------------------------------------------------------------

const slugify = (name) =>
    String(name).toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\w-]/g, "").slice(0, 190) || "item";

// products.slug is globally unique, so every hidden item gets a random
// suffix instead of relying on the name being unused.
const buildSlug = (name) => `${slugify(name)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

exports.createItem = async (sellerId, { name, price, initialStock }) => {
    const roundedPrice = Math.round(Number(price) * 100) / 100;
    if (!Number.isFinite(roundedPrice) || roundedPrice < 0) throw fail("Price must be zero or more.");

    let productId;
    for (let attempt = 0; attempt < 3 && !productId; attempt += 1) {
        try {
            productId = await posRepository.insertHiddenItem({
                sellerId, name: String(name).trim(), slug: buildSlug(name), price: roundedPrice
            });
        } catch (error) {
            if (!isDuplicateKeyError(error) || attempt === 2) throw error;
        }
    }

    const opening = Number(initialStock);
    if (Number.isInteger(opening) && opening > 0) {
        // Goes through the ledger like any other restock, so the opening
        // stock is on record.
        await exports.adjustStock(sellerId, { productId, type: "restock", quantity: opening, reason: "Opening stock" });
    }
    return posRepository.findItem(sellerId, productId);
};

exports.updateItem = async (sellerId, productId, { name, price }) => {
    const fields = {};
    if (name !== undefined) fields.name = String(name).trim();
    if (price !== undefined) {
        const rounded = Math.round(Number(price) * 100) / 100;
        if (!Number.isFinite(rounded) || rounded < 0) throw fail("Price must be zero or more.");
        fields.price = rounded;
    }
    const existing = await posRepository.findItem(sellerId, productId);
    if (!existing) throw fail("Item not found.", 404);
    await posRepository.updateItem(sellerId, productId, fields);
    return posRepository.findItem(sellerId, productId);
};
