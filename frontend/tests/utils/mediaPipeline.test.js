import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api/client", () => ({ default: { delete: vi.fn().mockResolvedValue({}), put: vi.fn().mockResolvedValue({}) } }));
vi.mock("../../src/utils/photoEdit", () => ({
    renderPhoto: vi.fn(async (file) => ({ name: "r.webp", type: "image/webp", size: 1000, from: file.name })),
    isEdited: vi.fn(() => false)
}));
vi.mock("../../src/utils/mediaUpload", () => ({ uploadMediaItem: vi.fn() }));

import api from "../../src/api/client";
import { renderPhoto } from "../../src/utils/photoEdit";
import { uploadMediaItem } from "../../src/utils/mediaUpload";
import { uploadPending, saveOrder, prepareFile } from "../../src/utils/mediaPipeline";

const t = (k) => k;
const item = (id, extra = {}) => ({ clientId: id, kind: "image", file: { name: `${id}.jpg`, type: "image/jpeg", size: 10 }, edits: {}, status: "queued", ...extra });

beforeEach(() => vi.clearAllMocks());

describe("uploadPending", () => {
    it("uploads queued items, reports progress and success", async () => {
        const dispatch = vi.fn();
        uploadMediaItem.mockImplementation(async (_p, _k, _f, _e, h) => { h.onProgress(50); return { id: 99 }; });
        const { failed, serverIds } = await uploadPending(5, [item("a"), item("b", { status: "done" })], dispatch, t);
        expect(failed).toBe(0);
        expect(serverIds.get("a")).toBe(99);
        expect(uploadMediaItem).toHaveBeenCalledTimes(1); // the finished one is skipped
        expect(dispatch).toHaveBeenCalledWith({ type: "progress", clientId: "a", progress: 50 });
        expect(dispatch).toHaveBeenCalledWith({ type: "uploaded", clientId: "a", serverId: 99 });
    });

    it("one failure does not stop the others and carries the server's message", async () => {
        const dispatch = vi.fn();
        uploadMediaItem
            .mockRejectedValueOnce({ response: { data: { message: "too big" } } })
            .mockResolvedValueOnce({ id: 2 });
        const { failed } = await uploadPending(5, [item("a"), item("b")], dispatch, t);
        expect(failed).toBe(1);
        expect(dispatch).toHaveBeenCalledWith({ type: "failed", clientId: "a", error: "too big" });
        expect(dispatch).toHaveBeenCalledWith({ type: "uploaded", clientId: "b", serverId: 2 });
    });

    it("retries items that previously errored", async () => {
        uploadMediaItem.mockResolvedValue({ id: 3 });
        const { failed } = await uploadPending(5, [item("a", { status: "error", error: "x" })], vi.fn(), t);
        expect(failed).toBe(0);
    });

    it("deletes the superseded server copy after re-uploading an edited item", async () => {
        uploadMediaItem.mockResolvedValue({ id: 8 });
        await uploadPending(5, [item("a", { staleServerId: 4 })], vi.fn(), t);
        expect(api.delete).toHaveBeenCalledWith("/products/5/media/4");
    });

    it("rejects an oversize file client-side without calling the server", async () => {
        const dispatch = vi.fn();
        renderPhoto.mockResolvedValueOnce({ name: "r.webp", type: "image/webp", size: 99 * 1024 * 1024 });
        const { failed } = await uploadPending(5, [item("a")], dispatch, t);
        expect(failed).toBe(1);
        expect(uploadMediaItem).not.toHaveBeenCalled();
    });
});

describe("prepareFile (HEIC path)", () => {
    it("uploads an undecodable HEIC original untouched", async () => {
        const heic = item("h", { file: { name: "a.heic", type: "", size: 10 }, undecodable: true });
        expect(await prepareFile(heic)).toBe(heic.file);
        expect(renderPhoto).not.toHaveBeenCalled();
    });
    it("falls back to the original when decoding fails and nothing was edited", async () => {
        renderPhoto.mockRejectedValueOnce(new Error("decode"));
        const it1 = item("a");
        expect(await prepareFile(it1)).toBe(it1.file);
    });
    it("passes videos through untouched", async () => {
        const v = item("v", { kind: "video" });
        expect(await prepareFile(v)).toBe(v.file);
    });
});

describe("saveOrder", () => {
    it("sends server ids in list order with the cover", async () => {
        const items = [item("a"), item("b")];
        const ids = { a: 11, b: 12 };
        await saveOrder(5, items, "b", (i) => ids[i.clientId]);
        expect(api.put).toHaveBeenCalledWith("/products/5/media/order", { ids: [11, 12], coverId: 12 });
    });
    it("refuses to save while something is not uploaded", async () => {
        await expect(saveOrder(5, [item("a")], "a", () => null)).rejects.toThrow();
    });
});
