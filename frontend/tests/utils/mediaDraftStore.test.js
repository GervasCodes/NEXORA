import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { saveMediaDraft, loadMediaDraft, clearMediaDraft } from "../../src/utils/mediaDraftStore";

describe("mediaDraftStore", () => {
    const state = {
        coverId: "a",
        items: [
            { clientId: "a", kind: "image", file: new Blob(["x"], { type: "image/jpeg" }), edits: { rotate: 90 }, status: "uploading", serverId: null, progress: 50 },
            { clientId: "b", kind: "video", file: null, url: "https://cdn/v.mp4", edits: {}, status: "done", serverId: 7 }
        ]
    };

    it("round-trips items, edits and cover; an interrupted upload resumes as queued", async () => {
        await saveMediaDraft("wizard:new", state);
        const loaded = await loadMediaDraft("wizard:new");
        expect(loaded.coverId).toBe("a");
        expect(loaded.items[0].edits.rotate).toBe(90);
        expect(loaded.items[0].status).toBe("queued");
        expect(loaded.items[1]).toMatchObject({ status: "done", serverId: 7 });
        expect(loaded.items[0].progress).toBeUndefined();
    });

    it("clears a draft", async () => {
        await saveMediaDraft("wizard:9", state);
        await clearMediaDraft("wizard:9");
        expect(await loadMediaDraft("wizard:9")).toBeUndefined();
    });

    it("returns undefined for a key that was never saved", async () => {
        expect(await loadMediaDraft("nope")).toBeUndefined();
    });
});
