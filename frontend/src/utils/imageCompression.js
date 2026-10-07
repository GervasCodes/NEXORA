// Client-side photo compression for product and service uploads.
//
// Phone photos are often 4-8 MB, which is slow on mobile data. Files over
// the threshold are resized and re-encoded as JPEG on the device. Smaller
// files, non-images, and anything the browser cannot decode (e.g. HEIC
// outside Safari) are returned unchanged.

const MAX_PHOTO_EDGE = 1600;
const COMPRESS_THRESHOLD_BYTES = 500 * 1024;

export async function compressImage(file) {
    if (!file.type.startsWith("image/") || file.size < COMPRESS_THRESHOLD_BYTES) return file;
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext("2d");
        // White underlay so transparent PNGs don't turn black when encoded as JPEG.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
        if (!blob || blob.size >= file.size) return file;
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
    } catch {
        return file;
    }
}
