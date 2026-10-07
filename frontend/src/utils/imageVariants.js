// Responsive srcset for Cloudinary-hosted images. Non-Cloudinary URLs
// return undefined so the browser just uses `src`.
export function imageSrcSet(url) {
    if (!url || typeof url !== "string") return undefined;
    if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return undefined;
    return [400, 800]
        .map((w) => `${url.replace("/upload/", `/upload/c_limit,w_${w},q_auto,f_auto/`)} ${w}w`)
        .join(", ");
}
