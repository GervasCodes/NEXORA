// Phase 5: single ordered list of everything the seller is uploading.
// Item: { clientId, kind: "image"|"video", file, edits, status, progress,
//         serverId, error, undecodable }
// status: "queued" | "uploading" | "done" | "error"
// The first image in the list is the cover unless coverId says otherwise.
import { MAX_IMAGES_PER_PRODUCT, MAX_VIDEOS_PER_PRODUCT } from "./mediaLimits";

export const initialMediaState = { items: [], coverId: null };

let counter = 0;
export const newClientId = () => `m${Date.now().toString(36)}${(counter += 1).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const kindOf = (file) => {
    if (file.type?.startsWith("video/")) return "video";
    if (file.type?.startsWith("image/") || /\.(heic|heif|avif)$/i.test(file.name || "")) return "image";
    return null;
};

export const defaultEdits = (kind) =>
    kind === "image"
        ? { aspect: "original", rotate: 0, brightness: 0, contrast: 0, saturation: 0, filter: "none", panX: 0, panY: 0, zoom: 1 }
        : { trimStart: 0, trimEnd: null, mute: false, coverTime: 0 };

const count = (items, kind) => items.filter((i) => i.kind === kind).length;

const ensureCover = (state) => {
    const images = state.items.filter((i) => i.kind === "image");
    if (images.length === 0) return { ...state, coverId: null };
    if (state.items.some((i) => i.clientId === state.coverId && i.kind === "image")) return state;
    return { ...state, coverId: images[0].clientId };
};

export function mediaReducer(state, action) {
    switch (action.type) {
        case "hydrate":
            return ensureCover({ items: action.items, coverId: action.coverId ?? null });

        case "add": {
            // action.entries: [{ clientId, kind, file, serverId?, status? }]
            const items = [...state.items];
            const rejected = [];
            for (const e of action.entries) {
                const full = e.kind === "image" ? count(items, "image") >= MAX_IMAGES_PER_PRODUCT : count(items, "video") >= MAX_VIDEOS_PER_PRODUCT;
                if (full) {
                    rejected.push(e.file?.name || e.clientId);
                    continue;
                }
                items.push({
                    clientId: e.clientId,
                    kind: e.kind,
                    file: e.file || null,
                    url: e.url || null,
                    edits: e.edits || defaultEdits(e.kind),
                    status: e.status || "queued",
                    progress: e.status === "done" ? 100 : 0,
                    serverId: e.serverId ?? null,
                    error: null,
                    undecodable: false
                });
            }
            return { ...ensureCover({ ...state, items }), rejected };
        }

        case "remove":
            return ensureCover({ ...state, items: state.items.filter((i) => i.clientId !== action.clientId) });

        case "move": {
            const { from, to } = action;
            if (from === to || from < 0 || to < 0 || from >= state.items.length || to >= state.items.length) return state;
            const items = [...state.items];
            const [moved] = items.splice(from, 1);
            items.splice(to, 0, moved);
            return { ...state, items };
        }

        case "setCover": {
            const item = state.items.find((i) => i.clientId === action.clientId);
            if (!item || item.kind !== "image") return state;
            return { ...state, coverId: item.clientId };
        }

        case "setEdits":
            return {
                ...state,
                items: state.items.map((i) =>
                    i.clientId === action.clientId
                        ? { ...i, edits: { ...i.edits, ...action.edits }, status: i.status === "done" ? "queued" : i.status, serverId: i.status === "done" ? null : i.serverId, staleServerId: i.status === "done" ? i.serverId : i.staleServerId }
                        : i
                )
            };

        case "markUndecodable":
            return { ...state, items: state.items.map((i) => (i.clientId === action.clientId ? { ...i, undecodable: true } : i)) };

        case "progress":
            return { ...state, items: state.items.map((i) => (i.clientId === action.clientId ? { ...i, status: "uploading", progress: action.progress, error: null } : i)) };

        case "uploaded":
            return {
                ...state,
                items: state.items.map((i) =>
                    i.clientId === action.clientId ? { ...i, status: "done", progress: 100, serverId: action.serverId, staleServerId: null, error: null } : i
                )
            };

        case "failed":
            return { ...state, items: state.items.map((i) => (i.clientId === action.clientId ? { ...i, status: "error", error: action.error } : i)) };

        case "retry":
            return { ...state, items: state.items.map((i) => (i.clientId === action.clientId && i.status === "error" ? { ...i, status: "queued", progress: 0, error: null } : i)) };

        default:
            return state;
    }
}

// Selectors
export const pendingItems = (state) => state.items.filter((i) => i.status === "queued" || i.status === "error");
export const allUploaded = (state) => state.items.length > 0 && state.items.every((i) => i.status === "done");
export const hasPhoto = (state) => state.items.some((i) => i.kind === "image");
