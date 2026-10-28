// Phase 5: the in-house photo editor's engine. Everything runs on a canvas
// on the seller's device - no third-party editor, no upload of the original.
// Pure helpers (computeCrop, applyAdjustments) are unit-tested; renderPhoto
// is the thin canvas wrapper around them.

export const ASPECT_RATIOS = { original: null, "1:1": 1, "4:5": 4 / 5, "16:9": 16 / 9 };

export const FILTER_PRESETS = {
    none: { brightness: 0, contrast: 0, saturation: 0, tint: null },
    warm: { brightness: 4, contrast: 6, saturation: 10, tint: [255, 160, 60, 0.12] },
    cool: { brightness: 2, contrast: 4, saturation: -4, tint: [60, 140, 255, 0.12] },
    mono: { brightness: 0, contrast: 12, saturation: -100, tint: null },
    vivid: { brightness: 2, contrast: 14, saturation: 35, tint: null },
    fade: { brightness: 8, contrast: -14, saturation: -12, tint: null }
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Source rectangle for a crop. zoom >= 1 narrows the window; panX/panY in
// [-1, 1] slide it within the image (0 = centred).
export function computeCrop(srcW, srcH, aspect, zoom = 1, panX = 0, panY = 0) {
    const ratio = ASPECT_RATIOS[aspect] ?? null;
    let w = srcW;
    let h = srcH;
    if (ratio) {
        if (srcW / srcH > ratio) w = srcH * ratio;
        else h = srcW / ratio;
    }
    const z = clamp(zoom, 1, 4);
    w /= z;
    h /= z;
    const maxX = srcW - w;
    const maxY = srcH - h;
    const sx = clamp(maxX / 2 + (clamp(panX, -1, 1) * maxX) / 2, 0, maxX);
    const sy = clamp(maxY / 2 + (clamp(panY, -1, 1) * maxY) / 2, 0, maxY);
    return { sx, sy, sw: w, sh: h };
}

// Size of the output after fitting the longest edge to maxEdge (never upscales).
export function fitOutput(w, h, maxEdge) {
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

// Brightness/contrast/saturation (-100..100 each) plus an optional filter
// preset, applied in place to RGBA pixel data.
export function applyAdjustments(data, edits) {
    const preset = FILTER_PRESETS[edits.filter] || FILTER_PRESETS.none;
    const brightness = clamp((edits.brightness || 0) + preset.brightness, -100, 100);
    const contrast = clamp((edits.contrast || 0) + preset.contrast, -100, 100);
    const saturation = clamp((edits.saturation || 0) + preset.saturation, -100, 100);
    if (!brightness && !contrast && !saturation && !preset.tint) return data;

    const add = brightness * 2.55;
    const cf = (259 * (contrast * 2.55 + 255)) / (255 * (259 - contrast * 2.55));
    const sat = 1 + saturation / 100;
    const tint = preset.tint;

    for (let i = 0; i < data.length; i += 4) {
        let r = data[i] + add;
        let g = data[i + 1] + add;
        let b = data[i + 2] + add;
        r = cf * (r - 128) + 128;
        g = cf * (g - 128) + 128;
        b = cf * (b - 128) + 128;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        r = lum + (r - lum) * sat;
        g = lum + (g - lum) * sat;
        b = lum + (b - lum) * sat;
        if (tint) {
            r += (tint[0] - r) * tint[3];
            g += (tint[1] - g) * tint[3];
            b += (tint[2] - b) * tint[3];
        }
        data[i] = clamp(r, 0, 255);
        data[i + 1] = clamp(g, 0, 255);
        data[i + 2] = clamp(b, 0, 255);
    }
    return data;
}

export async function decodeImage(file) {
    if (typeof createImageBitmap === "function") {
        return createImageBitmap(file);
    }
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("decode failed"));
        };
        img.src = url;
    });
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// Renders `file` with `edits` to a WebP (JPEG where WebP encoding is not
// supported), longest edge <= maxEdge. Also strips EXIF/GPS as a side effect
// of re-encoding.
export async function renderPhoto(file, edits, { maxEdge = 1600, quality = 0.85 } = {}) {
    const bitmap = await decodeImage(file);
    const rotate = ((edits.rotate || 0) % 360 + 360) % 360;
    const swap = rotate === 90 || rotate === 270;
    const rw = swap ? bitmap.height : bitmap.width;
    const rh = swap ? bitmap.width : bitmap.height;

    // 1) rotated full-size surface
    const rotated = document.createElement("canvas");
    rotated.width = rw;
    rotated.height = rh;
    const rctx = rotated.getContext("2d");
    rctx.translate(rw / 2, rh / 2);
    rctx.rotate((rotate * Math.PI) / 180);
    rctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    bitmap.close?.();

    // 2) crop + scale into the output
    const { sx, sy, sw, sh } = computeCrop(rw, rh, edits.aspect, edits.zoom, edits.panX, edits.panY);
    const { width, height } = fitOutput(sw, sh, maxEdge);
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const octx = out.getContext("2d");
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, width, height);
    octx.drawImage(rotated, sx, sy, sw, sh, 0, 0, width, height);

    // 3) tone adjustments
    const pixels = octx.getImageData(0, 0, width, height);
    applyAdjustments(pixels.data, edits);
    octx.putImageData(pixels, 0, 0);

    let blob = await toBlob(out, "image/webp", quality);
    let ext = "webp";
    if (!blob || blob.type !== "image/webp") {
        blob = await toBlob(out, "image/jpeg", quality);
        ext = "jpg";
    }
    if (!blob) throw new Error("encode failed");
    const base = (file.name || "photo").replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.${ext}`, { type: blob.type });
}

export const isEdited = (edits) =>
    Boolean(edits) &&
    Boolean(
        edits.aspect !== "original" || edits.rotate || edits.brightness || edits.contrast ||
        edits.saturation || (edits.filter && edits.filter !== "none") || (edits.zoom && edits.zoom !== 1)
    );
