// Phase 5: direct-to-Cloudinary upload with per-file progress, chunking for
// large videos and automatic retries. The server only signs the upload and
// afterwards verifies what actually arrived (see productMedia.service.js).
import api from "../api/client";

const RETRIES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One XHR request. Resolves with parsed JSON; rejects with { retryable }.
function xhrPost(url, form, headers, onProgress, signal) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        Object.entries(headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded, e.total);
        xhr.onload = () => {
            let body = null;
            try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
            if (xhr.status >= 200 && xhr.status < 300) return resolve(body);
            const err = new Error(body?.error?.message || `Upload failed (${xhr.status})`);
            err.retryable = xhr.status >= 500 || xhr.status === 429 || xhr.status === 0;
            reject(err);
        };
        xhr.onerror = () => reject(Object.assign(new Error("Network error"), { retryable: true }));
        xhr.onabort = () => reject(Object.assign(new Error("Cancelled"), { retryable: false, cancelled: true }));
        signal?.addEventListener("abort", () => xhr.abort());
        xhr.send(form);
    });
}

async function withRetry(fn, signal) {
    let lastErr;
    for (let attempt = 0; attempt < RETRIES; attempt += 1) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (!err.retryable || signal?.aborted) break;
            await sleep(600 * 2 ** attempt);
        }
    }
    throw lastErr;
}

function buildForm(sign, file) {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", sign.apiKey);
    form.append("timestamp", sign.params.timestamp);
    form.append("signature", sign.signature);
    form.append("folder", sign.params.folder);
    form.append("allowed_formats", sign.params.allowed_formats);
    return form;
}

// Uploads `file` and resolves with the Cloudinary response ({ public_id, ... }).
export async function uploadToCloudinary(sign, file, { onProgress, signal } = {}) {
    if (file.size <= sign.chunkBytes) {
        return withRetry(
            () => xhrPost(sign.uploadUrl, buildForm(sign, file), null, (l, t) => onProgress?.(Math.round((l / t) * 100)), signal),
            signal
        );
    }

    // Chunked (large videos): same signed params, Content-Range per slice.
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let result = null;
    for (let start = 0; start < file.size; start += sign.chunkBytes) {
        const end = Math.min(start + sign.chunkBytes, file.size);
        const slice = file.slice(start, end);
        result = await withRetry(
            () => xhrPost(
                sign.uploadUrl,
                buildForm(sign, slice),
                { "X-Unique-Upload-Id": uploadId, "Content-Range": `bytes ${start}-${end - 1}/${file.size}` },
                (l) => onProgress?.(Math.round(((start + l) / file.size) * 100)),
                signal
            ),
            signal
        );
    }
    return result;
}

// Whole pipeline for one media item: sign -> upload -> register.
export async function uploadMediaItem(productId, kind, file, edits, handlers = {}) {
    const { data: signed } = await api.post(`/products/${productId}/media/sign`, { kind });
    const sign = signed.data;
    const uploaded = await uploadToCloudinary(sign, file, handlers);
    const { data: registered } = await api.post(`/products/${productId}/media`, {
        kind,
        publicId: uploaded.public_id,
        edits
    });
    return registered.data;
}
