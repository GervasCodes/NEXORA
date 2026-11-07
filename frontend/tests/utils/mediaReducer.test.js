import { describe, it, expect } from "vitest";
import { mediaReducer, initialMediaState, defaultEdits, allUploaded, kindOf } from "../../src/utils/mediaReducer";

const img = (id) => ({ clientId: id, kind: "image", file: { name: `${id}.jpg` } });
const vid = (id) => ({ clientId: id, kind: "video", file: { name: `${id}.mp4` } });
const add = (state, ...entries) => mediaReducer(state, { type: "add", entries });

describe("mediaReducer", () => {
    it("adds photos and videos into one list; first photo becomes the cover", () => {
        const s = add(initialMediaState, vid("v1"), img("a"), img("b"));
        expect(s.items.map((i) => i.clientId)).toEqual(["v1", "a", "b"]);
        expect(s.coverId).toBe("a");
    });

    it("enforces the per-kind caps and reports what it rejected", () => {
        const many = Array.from({ length: 12 }, (_, i) => img(`p${i}`));
        const s = add(initialMediaState, ...many);
        expect(s.items.filter((i) => i.kind === "image")).toHaveLength(10);
        expect(s.rejected).toEqual(["p10.jpg", "p11.jpg"]);
    });

    it("moves items (drag or keyboard) and ignores out-of-range moves", () => {
        let s = add(initialMediaState, img("a"), img("b"), img("c"));
        s = mediaReducer(s, { type: "move", from: 2, to: 0 });
        expect(s.items.map((i) => i.clientId)).toEqual(["c", "a", "b"]);
        expect(mediaReducer(s, { type: "move", from: 0, to: 9 })).toBe(s);
    });

    it("only lets a photo be the cover, and re-picks a cover when the cover is removed", () => {
        let s = add(initialMediaState, img("a"), vid("v"), img("b"));
        expect(mediaReducer(s, { type: "setCover", clientId: "v" })).toBe(s);
        s = mediaReducer(s, { type: "setCover", clientId: "b" });
        expect(s.coverId).toBe("b");
        s = mediaReducer(s, { type: "remove", clientId: "b" });
        expect(s.coverId).toBe("a");
        s = mediaReducer(s, { type: "remove", clientId: "a" });
        expect(s.coverId).toBeNull();
    });

    it("tracks upload progress, success, failure and retry", () => {
        let s = add(initialMediaState, img("a"));
        s = mediaReducer(s, { type: "progress", clientId: "a", progress: 40 });
        expect(s.items[0]).toMatchObject({ status: "uploading", progress: 40 });
        s = mediaReducer(s, { type: "failed", clientId: "a", error: "network" });
        expect(s.items[0]).toMatchObject({ status: "error", error: "network" });
        s = mediaReducer(s, { type: "retry", clientId: "a" });
        expect(s.items[0]).toMatchObject({ status: "queued", progress: 0, error: null });
        s = mediaReducer(s, { type: "uploaded", clientId: "a", serverId: 9 });
        expect(s.items[0]).toMatchObject({ status: "done", serverId: 9 });
        expect(allUploaded(s)).toBe(true);
    });

    it("re-queues an already-uploaded item when it is edited again", () => {
        let s = add(initialMediaState, img("a"));
        s = mediaReducer(s, { type: "uploaded", clientId: "a", serverId: 9 });
        s = mediaReducer(s, { type: "setEdits", clientId: "a", edits: { rotate: 90 } });
        expect(s.items[0]).toMatchObject({ status: "queued", serverId: null, staleServerId: 9 });
        expect(s.items[0].edits.rotate).toBe(90);
    });

    it("hydrates saved work and keeps a valid cover", () => {
        const items = [{ clientId: "a", kind: "image", edits: defaultEdits("image"), status: "queued" }];
        const s = mediaReducer(initialMediaState, { type: "hydrate", items, coverId: "zzz" });
        expect(s.coverId).toBe("a");
    });

    it("classifies files, including HEIC with no mime type", () => {
        expect(kindOf({ type: "video/mp4", name: "a" })).toBe("video");
        expect(kindOf({ type: "", name: "IMG.HEIC" })).toBe("image");
        expect(kindOf({ type: "audio/mpeg", name: "a.mp3" })).toBeNull();
    });
});
