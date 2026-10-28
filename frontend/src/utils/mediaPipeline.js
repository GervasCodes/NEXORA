// Phase 5: turns the wizard's list into server media. For each queued item:
// bake photo edits on the device (WebP, max 1600 px, EXIF dropped), check
// limits, upload straight to Cloudinary with progress, register with the
// server. Two files upload at a time; one failure never stops the others.
import api from "../api/client";
import { renderPhoto, isEdited } from "./photoEdit";
import { checkMediaFile } from "./mediaLimits";
import { uploadMediaItem } from "./mediaUpload";

const CONCURRENCY = 2;

export async function prepareFile(item) {
    if (item.kind === "video") return item.file;
    // HEIC/AVIF the browser cannot decode: upload the original untouched
    // (Cloudinary converts it for delivery); editing is unavailable for it.
    if (item.undecodable) return item.file;
    try {
        return await renderPhoto(item.file, item.edits);
    } catch (err) {
        // Not decodable here: fall back to the original file.
        if (!isEdited(item.edits)) return item.file;
        throw err;
    }
}

async function processItem(productId, item, dispatch, t) {
    dispatch({ type: "progress", clientId: item.clientId, progress: 0 });
    try {
        const file = await prepareFile(item);
        const problem = checkMediaFile(file, item.kind);
        if (problem) throw new Error(t(problem.key, problem.params));

        const media = await uploadMediaItem(productId, item.kind, file, item.edits, {
            onProgress: (progress) => dispatch({ type: "progress", clientId: item.clientId, progress })
        });
        // Re-uploaded after an edit: remove the superseded server copy.
        if (item.staleServerId) {
            await api.delete(`/products/${productId}/media/${item.staleServerId}`).catch(() => {});
        }
        dispatch({ type: "uploaded", clientId: item.clientId, serverId: media.id });
        return media.id;
    } catch (err) {
        const message = err?.response?.data?.message || err?.message || t("wizard.uploadFailed");
        dispatch({ type: "failed", clientId: item.clientId, error: message });
        return null;
    }
}

// Returns { failed, serverIds: Map(clientId -> serverId) } for the processed items.
export async function uploadPending(productId, items, dispatch, t) {
    const queue = items.filter((i) => i.status === "queued" || i.status === "error");
    const serverIds = new Map();
    let failed = 0;
    let next = 0;
    const worker = async () => {
        while (next < queue.length) {
            const item = queue[next];
            next += 1;
            const id = await processItem(productId, item, dispatch, t);
            if (id === null) failed += 1;
            else serverIds.set(item.clientId, id);
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    return { failed, serverIds };
}

// Persist final order + cover once everything is uploaded.
export async function saveOrder(productId, items, coverClientId, serverIdOf) {
    const ids = items.map((i) => serverIdOf(i));
    if (ids.some((id) => !id)) throw new Error("not all items are uploaded");
    const cover = items.find((i) => i.clientId === coverClientId);
    await api.put(`/products/${productId}/media/order`, { ids, coverId: cover ? serverIdOf(cover) : null });
}
