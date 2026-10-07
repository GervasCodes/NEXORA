import { useEffect, useRef, useState } from "react";

const OUTPUT_SIZE = 512;
const VIEW_SIZE = 280;

/**
 * Square crop step shown before a profile photo is uploaded.
 * Drag to pan, slider to zoom. onConfirm receives a JPEG Blob of the
 * visible square; onCancel closes without uploading.
 */
export default function ImageCropper({ file, onConfirm, onCancel, busy = false }) {
    const [src, setSrc] = useState(null);
    const [img, setImg] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const dragRef = useRef(null);

    useEffect(() => {
        if (!file) return undefined;
        const url = URL.createObjectURL(file);
        setSrc(url);
        const image = new Image();
        image.onload = () => {
            setImg(image);
            setZoom(1);
            setOffset({ x: 0, y: 0 });
        };
        image.src = url;
        return () => URL.revokeObjectURL(url);
    }, [file]);

    // Base scale makes the shorter side fill the square at zoom 1.
    const baseScale = img ? VIEW_SIZE / Math.min(img.width, img.height) : 1;
    const scale = baseScale * zoom;

    // Clamp so the square always stays covered by the image.
    const clamp = (x, y, s) => {
        if (!img) return { x, y };
        const w = img.width * s;
        const h = img.height * s;
        const maxX = Math.max(0, (w - VIEW_SIZE) / 2);
        const maxY = Math.max(0, (h - VIEW_SIZE) / 2);
        return {
            x: Math.min(maxX, Math.max(-maxX, x)),
            y: Math.min(maxY, Math.max(-maxY, y)),
        };
    };

    const onPointerDown = (e) => {
        dragRef.current = { startX: e.clientX, startY: e.clientY, origin: offset };
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
        if (!dragRef.current) return;
        const { startX, startY, origin } = dragRef.current;
        setOffset(clamp(origin.x + e.clientX - startX, origin.y + e.clientY - startY, scale));
    };
    const onPointerUp = () => {
        dragRef.current = null;
    };

    const handleZoom = (value) => {
        const nextZoom = Number(value);
        setZoom(nextZoom);
        setOffset((prev) => clamp(prev.x, prev.y, baseScale * nextZoom));
    };

    const handleConfirm = () => {
        if (!img) return;
        const canvas = document.createElement("canvas");
        canvas.width = OUTPUT_SIZE;
        canvas.height = OUTPUT_SIZE;
        const ctx = canvas.getContext("2d");
        // Map the visible VIEW_SIZE square back onto the source image.
        const sourceSide = VIEW_SIZE / scale;
        const sourceX = img.width / 2 - offset.x / scale - sourceSide / 2;
        const sourceY = img.height / 2 - offset.y / scale - sourceSide / 2;
        ctx.drawImage(img, sourceX, sourceY, sourceSide, sourceSide, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        canvas.toBlob(
            (blob) => blob && onConfirm(blob),
            "image/jpeg",
            0.92
        );
    };

    if (!file) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Crop profile photo"
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
            <div className="bg-white rounded-lg p-5 w-full max-w-sm">
                <h3 className="font-display text-lg mb-3">Adjust your photo</h3>

                <div
                    className="relative mx-auto overflow-hidden rounded-full bg-neutral-100 cursor-move touch-none select-none"
                    style={{ width: VIEW_SIZE, height: VIEW_SIZE }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                >
                    {src && img && (
                        <img
                            src={src}
                            alt=""
                            draggable={false}
                            className="absolute max-w-none pointer-events-none"
                            style={{
                                width: img.width * scale,
                                height: img.height * scale,
                                left: VIEW_SIZE / 2 - (img.width * scale) / 2 + offset.x,
                                top: VIEW_SIZE / 2 - (img.height * scale) / 2 + offset.y,
                            }}
                        />
                    )}
                </div>

                <label className="block text-xs mt-4 mb-1" htmlFor="photoZoom">Zoom</label>
                <input
                    id="photoZoom"
                    type="range"
                    min="1"
                    max="3"
                    step="0.01"
                    value={zoom}
                    onChange={(e) => handleZoom(e.target.value)}
                    className="w-full"
                />

                <div className="flex justify-end gap-2 mt-5">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className="text-sm border border-line px-4 py-2 rounded-md disabled:opacity-60"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={busy || !img}
                        className="text-sm bg-ink text-white px-4 py-2 rounded-md disabled:opacity-60"
                    >
                        {busy ? "Uploading…" : "Save photo"}
                    </button>
                </div>
            </div>
        </div>
    );
}
