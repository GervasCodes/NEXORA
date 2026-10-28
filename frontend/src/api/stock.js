import api from "./client";

// Nexora Stock Management (Phase 6) - thin wrappers so pages stay free of URLs.
const BASE = "/seller/stock";

export const listStockItems = (params) => api.get(`${BASE}/items`, { params }).then((r) => r.data.data);
export const getStockItem = (id) => api.get(`${BASE}/items/${id}`).then((r) => r.data.data);
export const createStockItem = (body) => api.post(`${BASE}/items`, body).then((r) => r.data.data);
export const updateStockItem = (id, body) => api.put(`${BASE}/items/${id}`, body).then((r) => r.data.data);
export const archiveStockItem = (id) => api.post(`${BASE}/items/${id}/archive`).then((r) => r.data.data);
export const unarchiveStockItem = (id) => api.post(`${BASE}/items/${id}/unarchive`).then((r) => r.data.data);
export const adjustStockItem = (id, body) => api.post(`${BASE}/items/${id}/stock`, body).then((r) => r.data);
export const listItemOnNexora = (id, body = {}) => api.post(`${BASE}/items/${id}/list-on-nexora`, body).then((r) => r.data.data);
export const unlinkStockItem = (id) => api.post(`${BASE}/items/${id}/unlink`).then((r) => r.data.data);
export const listStockMovements = (params) => api.get(`${BASE}/movements`, { params }).then((r) => r.data.data);
export const reconcileStock = () => api.get(`${BASE}/reconcile`).then((r) => r.data.data);

// One id per form open so a double tap or a retry on a bad connection cannot
// move stock twice (the server replays the first result).
export const newRequestId = () =>
    (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`;

// ---- Phase 7: sales, purchases, customers, suppliers, receipts
export const lookupStockItems = (params) => api.get(`${BASE}/lookup`, { params }).then((r) => r.data.data);

export const createSale = (body) => api.post(`${BASE}/sales`, body).then((r) => r.data.data);
export const listSales = (params) => api.get(`${BASE}/sales`, { params }).then((r) => r.data.data);
export const getSale = (id) => api.get(`${BASE}/sales/${id}`).then((r) => r.data.data);
export const voidSale = (id, body) => api.post(`${BASE}/sales/${id}/void`, body).then((r) => r.data.data);
export const returnSale = (id, body) => api.post(`${BASE}/sales/${id}/return`, body).then((r) => r.data.data);
export const getReceipt = (id, lang) => api.get(`${BASE}/sales/${id}/receipt`, { params: { lang } }).then((r) => r.data.data);
export const downloadReceiptPdf = async (id, lang, filename) => {
    const res = await api.get(`${BASE}/sales/${id}/receipt.pdf`, { params: { lang }, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `receipt-${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const createPurchase = (body) => api.post(`${BASE}/purchases`, body).then((r) => r.data.data);
export const listPurchases = (params) => api.get(`${BASE}/purchases`, { params }).then((r) => r.data.data);
export const getPurchase = (id) => api.get(`${BASE}/purchases/${id}`).then((r) => r.data.data);
export const payPurchase = (id, body) => api.post(`${BASE}/purchases/${id}/payments`, body).then((r) => r.data.data);

export const listCustomers = (params) => api.get(`${BASE}/customers`, { params }).then((r) => r.data.data);
export const createCustomer = (body) => api.post(`${BASE}/customers`, body).then((r) => r.data.data);
export const updateCustomer = (id, body) => api.put(`${BASE}/customers/${id}`, body).then((r) => r.data.data);
export const getCustomer = (id) => api.get(`${BASE}/customers/${id}`).then((r) => r.data.data);
export const receiveCustomerPayment = (id, body) => api.post(`${BASE}/customers/${id}/payments`, body).then((r) => r.data.data);

export const listSuppliers = (params) => api.get(`${BASE}/suppliers`, { params }).then((r) => r.data.data);
export const createSupplier = (body) => api.post(`${BASE}/suppliers`, body).then((r) => r.data.data);
export const updateSupplier = (id, body) => api.put(`${BASE}/suppliers/${id}`, body).then((r) => r.data.data);
export const getSupplier = (id) => api.get(`${BASE}/suppliers/${id}`).then((r) => r.data.data);

// ---- Phase 8: plan access, offline sync, expenses, reports, import / export
export const getStockAccess = () => api.get(`${BASE}/access`).then((r) => r.data.data);

// Sales rung up offline, sent in a batch of at most 50 (see utils/stockOfflineStore.js).
export const syncOfflineSales = (sales) => api.post(`${BASE}/sales/sync`, { sales }).then((r) => r.data.data);

export const listExpenses = (params) => api.get(`${BASE}/expenses`, { params }).then((r) => r.data.data);
export const createExpense = ({ receipt, ...fields }) => {
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") form.append(k, v); });
    if (receipt) form.append("receipt", receipt);
    return api.post(`${BASE}/expenses`, form).then((r) => r.data.data);
};
export const voidExpense = (id, body) => api.post(`${BASE}/expenses/${id}/void`, body).then((r) => r.data.data);

export const getReport = (name, params) => api.get(`${BASE}/reports/${name}`, { params }).then((r) => r.data.data);

const saveBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const filenameOf = (res, fallback) => /filename="([^"]+)"/.exec(res.headers?.["content-disposition"] || "")?.[1] || fallback;

export const downloadImportTemplate = async (lang) => {
    const res = await api.get(`${BASE}/import/template`, { params: { lang }, responseType: "blob" });
    saveBlob(res.data, filenameOf(res, `nexora-items-template-${lang}.csv`));
};
export const downloadStockCsv = async (kind, params) => {
    const res = await api.get(`${BASE}/export/${kind}`, { params, responseType: "blob" });
    saveBlob(res.data, filenameOf(res, `nexora-${kind}.csv`));
};
export const importStockItems = (file, { dryRun, idempotencyKey }) => {
    const form = new FormData();
    form.append("dry_run", dryRun ? "1" : "0");
    if (idempotencyKey) form.append("idempotency_key", idempotencyKey);
    form.append("file", file);
    return api.post(`${BASE}/import/items`, form).then((r) => r.data.data);
};
