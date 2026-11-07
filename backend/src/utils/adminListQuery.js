// Shared parsing for admin list endpoints (Phase 8 server-side paging).
// Paging is opt-in: a list handler only switches to the paged shape when
// the caller sends one of PAGED_PARAMS, so existing unpaged callers keep
// receiving the same bare array in `data`.

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_QUERY_LENGTH = 100;
const PAGED_PARAMS = ["page", "pageSize", "q", "status", "role", "paymentStatus"];

exports.wantsPaging = (query = {}) => PAGED_PARAMS.some((key) => query[key] !== undefined && query[key] !== "");

exports.parseListQuery = (query = {}) => {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.pageSize, 10) || DEFAULT_PAGE_SIZE));
    const q = typeof query.q === "string" ? query.q.trim().slice(0, MAX_QUERY_LENGTH) : "";
    const status = typeof query.status === "string" && query.status ? query.status : null;
    const role = typeof query.role === "string" && query.role ? query.role : null;
    const paymentStatus = typeof query.paymentStatus === "string" && query.paymentStatus ? query.paymentStatus : null;
    return { page, pageSize, offset: (page - 1) * pageSize, q, status, role, paymentStatus };
};

// LIKE pattern with %, _ and \ escaped so user input matches literally.
exports.likeTerm = (q) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

exports.isNumericTerm = (q) => /^\d{1,10}$/.test(q);

exports.buildMeta = (total, { page, pageSize }) => ({
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
});
